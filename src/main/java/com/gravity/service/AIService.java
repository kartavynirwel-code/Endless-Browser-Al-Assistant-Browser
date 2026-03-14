package com.gravity.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.gravity.model.AIResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class AIService {

    private final ObjectMapper objectMapper;
    private final WebClient webClient = WebClient.builder()
            .codecs(configurer -> configurer.defaultCodecs().maxInMemorySize(64 * 1024 * 1024)) // 64MB for large images
            .build();

    private static final String OLLAMA_URL = "http://localhost:11434/api/generate";
    private static final String MODEL_REASONING = "phi3:mini";
    private static final String MODEL_VISION = "moondream";

    /**
     * Calls Local Ollama API with specific model
     */
    private String callOllamaAPI(Map<String, Object> requestBody, String modelName) throws Exception {
        log.info("Sending request to local Ollama API (Model: {})...", modelName);
        requestBody.put("model", modelName);

        return webClient.post()
                .uri(OLLAMA_URL)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofMinutes(5))
                .block(Duration.ofMinutes(5));
    }

    public AIResponse getNextAction(String instruction, String screenshot, List<String> history) {
        String systemPrompt = """
            You are Endless, an AI browser assistant. 
            You control a real web browser to complete user tasks.
            Always respond ONLY in valid JSON with exactly these keys: 
            "thought", "action", "target", "value", "message".
            
            Action can be: click, type, scroll, navigate, extract, done.
            IMPORTANT: For 'click' or 'type' actions, your "target" MUST be copied exactly from the [TARGET: ...] list provided in the prompt. Do NOT invent CSS selectors!
            Value is the text to type if action is 'type'.
            Think step by step. If a task requires multiple clicks (like answering a quiz), only do ONE click at a time.
            
            Format:
            {
              "thought": "I need to select HTML. I see the target for the HTML radio button in the elements list. I will click it.",
              "action": "click",
              "target": "input[name='q1'][value='HTML']",
              "value": "",
              "message": "Clicking the HTML radio button"
            }
            """;

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("system", systemPrompt);
        requestBody.put("stream", false);

        // Text instruction with history
        StringBuilder prompt = new StringBuilder();
        prompt.append("User task: ").append(instruction).append("\n");
        if (history != null && !history.isEmpty()) {
            prompt.append("\nPrevious steps:\n");
            for (String h : history) {
                prompt.append("- ").append(h).append("\n");
            }
        }
        requestBody.put("prompt", prompt.toString());

        // Format is supported in Ollama to force JSON
        requestBody.put("format", "json");

        // Screenshot if available
        if (screenshot != null && !screenshot.isEmpty()) {
            // Ollama expects a list of base64 strings
            requestBody.put("images", List.of(screenshot));
        }

        try {
            String responseStr = callOllamaAPI(requestBody, MODEL_REASONING);
            return parseAIResponse(responseStr);

        } catch (Exception e) {
            log.error("Error calling Ollama API: ", e);
            return AIResponse.builder()
                    .action("done")
                    .message("Error calling local AI: " + e.getMessage() + ". Is Ollama running?")
                    .build();
        }
    }

    private AIResponse parseAIResponse(String rawResponse) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(rawResponse);
        String textContent = root.path("response").asText();

        Pattern pattern = Pattern.compile("```json\\s*(.*?)\\s*```", Pattern.DOTALL);
        Matcher matcher = pattern.matcher(textContent);
        if (matcher.find()) {
            textContent = matcher.group(1);
        } else {
            int startIdx = textContent.indexOf("{");
            int endIdx = textContent.lastIndexOf("}");
            if(startIdx != -1 && endIdx != -1) {
                textContent = textContent.substring(startIdx, endIdx + 1);
            }
        }
        
        return objectMapper.readValue(textContent, AIResponse.class);
    }

    /**
     * Simple chat - no browser automation, just Q&A with AI
     */
    public String chat(String userMessage, String image) {
        String visualSummary = "";
        if (image != null && !image.isEmpty()) {
            try {
                Map<String, Object> visionBody = new HashMap<>();
                visionBody.put("prompt", "Describe this image briefly.");
                visionBody.put("stream", false);
                String cleanImg = image.startsWith("data:image") ? image.substring(image.indexOf(",") + 1) : image;
                visionBody.put("images", List.of(cleanImg));
                String visionResp = callOllamaAPI(visionBody, MODEL_VISION);
                visualSummary = objectMapper.readTree(visionResp).path("response").asText();
            } catch (Exception e) {
                log.warn("Vision summary failed in chat: {}", e.getMessage());
            }
        }

        Map<String, Object> requestBody = new HashMap<>();
        String systemPrompt = "You are Endless, a helpful AI assistant. Answer the user's question clearly.";
        requestBody.put("system", systemPrompt);
        
        StringBuilder prompt = new StringBuilder();
        if (!visualSummary.isEmpty()) {
            prompt.append("[SCREEN CONTEXT]: ").append(visualSummary).append("\n\n");
        }
        prompt.append("USER: ").append(userMessage);
        requestBody.put("prompt", prompt.toString());
        requestBody.put("stream", false);

        try {
            String responseStr = callOllamaAPI(requestBody, MODEL_REASONING);
            JsonNode root = objectMapper.readTree(responseStr);
            return root.path("response").asText();
        } catch (Exception e) {
            log.error("Error in chat: ", e);
            return "Error: " + e.getMessage();
        }
    }

    public List<Map<String, Object>> generateAutomationActions(String command, String screenshot, List<Map<String, Object>> dom, List<String> history, String pageText) {
        String visualSummary = "No visual analysis performed.";

        // --- STEP 1: VISION (moondream) ---
        if (screenshot != null && !screenshot.isEmpty()) {
            try {
                log.info("Two-Model Strategy: Calling moondream for visual analysis...");
                Map<String, Object> visionBody = new HashMap<>();
                visionBody.put("prompt", "Analyze this webpage. Describe the main sections, any forms, navigation menus, and what the page is about. Help me understand how to interact with it.");
                visionBody.put("stream", false);
                
                String cleanImg = screenshot;
                if (cleanImg.startsWith("data:image")) {
                    cleanImg = cleanImg.substring(cleanImg.indexOf(",") + 1);
                }
                visionBody.put("images", List.of(cleanImg));
                
                String visionResp = callOllamaAPI(visionBody, MODEL_VISION);
                visualSummary = objectMapper.readTree(visionResp).path("response").asText();
                log.info("Visual Summary from moondream: {}", visualSummary);
            } catch (Exception e) {
                log.warn("moondream vision analysis failed, falling back to text only: {}", e.getMessage());
            }
        }

        // --- STEP 2: REASONING (phi3:mini) ---
        String systemPrompt = """
            SYSTEM: You are an Expert Web Automation & Intelligence Agent. 
            You must analyze the VISUAL layout, the full PAGE TEXT transcript, and the technical DOM elements to fulfill the USER COMMAND.
            
            GOAL: Efficiently and accurately complete the user's request on any website.
            
            OPERATIONAL RULES:
            1. CLARITY: Use "PAGE TEXT" to understand the content, labels, and context of the page.
            2. MAPPING: Match your intended action to the correct data-gravity-id in the "DOM ELEMENTS" map.
            3. ACTION TYPES: 
               - 'type': For inputs, textareas, or search boxes.
               - 'click': For buttons, links, radio buttons, or checkboxes.
               - 'select': To choose an option from a dropdown (value should be the option text).
            4. ACCURACY: Provide professional and logical values for form-filling or answering.
            5. COMPLETION: Only click "Submit", "Search", or destructive buttons if the user explicitly requested it or if all prerequisites are met.
            6. OUTPUT: Respond ONLY with a JSON array of actions. No conversational text.
            
            Action schema example:
            [
              {
                "action": "type",
                "targetId": 12,
                "value": "Search query",
                "reason": "Typing the search query into the search box"
              },
              {
                "action": "click",
                "targetId": 15,
                "reason": "Clicking the search button"
              }
            ]
            """;

        StringBuilder promptBuilder = new StringBuilder();
        promptBuilder.append("USER COMMAND: ").append(command).append("\n\n");
        promptBuilder.append("VISUAL ANALYSIS (from moondream):\n").append(visualSummary).append("\n\n");
        promptBuilder.append("PAGE TEXT TRANSCRIPT:\n").append(pageText != null ? pageText : "No text extracted").append("\n\n");
        if (history != null && !history.isEmpty()) {
            promptBuilder.append("HISTORY:\n");
            history.forEach(h -> promptBuilder.append("- ").append(h).append("\n"));
        }
        promptBuilder.append("\nDOM ELEMENTS:\n").append(dom.toString());

        Map<String, Object> reasoningBody = new HashMap<>();
        reasoningBody.put("system", systemPrompt);
        reasoningBody.put("prompt", promptBuilder.toString());
        reasoningBody.put("stream", false);
        
        Map<String, Object> options = new HashMap<>();
        options.put("temperature", 0.0);
        options.put("num_predict", 500); 
        reasoningBody.put("options", options);

        try {
            String responseStr = callOllamaAPI(reasoningBody, MODEL_REASONING);
            return parseActionList(responseStr);
        } catch (Exception e) {
            log.error("Reasoning failed: ", e);
            return List.of(Map.of("action", "error", "reason", e.getMessage()));
        }
    }

    private List<Map<String, Object>> parseActionList(String rawResponse) throws JsonProcessingException {
        JsonNode root = objectMapper.readTree(rawResponse);
        String actionsJson = root.path("response").asText();

        // For JSON Arrays, manual parsing is safer than Ollama's format:json
        int start = actionsJson.indexOf("[");
        int end = actionsJson.lastIndexOf("]");
        if (start != -1 && end != -1) {
            actionsJson = actionsJson.substring(start, end + 1);
        } else {
            return List.of(); // or some default action
        }

        return objectMapper.readValue(actionsJson, List.class);
    }
}
