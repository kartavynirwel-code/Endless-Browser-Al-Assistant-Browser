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
        String systemPrompt = """
            You are Endless, a helpful AI assistant built into a web browser.
            Answer the user's question clearly and concisely.
            You can help with general knowledge, coding, research, and more.
            Be friendly and natural in your responses.
            """;

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("system", systemPrompt);
        requestBody.put("prompt", userMessage);
        requestBody.put("stream", false);

        if (image != null && !image.isEmpty()) {
            if (image.startsWith("data:image")) {
                image = image.substring(image.indexOf(",") + 1);
            }
            requestBody.put("images", List.of(image));
        }

        try {
            String responseStr = callOllamaAPI(requestBody, MODEL_VISION); // Vision chat defaults to vision model
            JsonNode root = objectMapper.readTree(responseStr);
            return root.path("response").asText();

        } catch (Exception e) {
            log.error("Error in chat: ", e);
            if (e.getMessage() != null && e.getMessage().contains("500")) {
                return "The local AI (Ollama) hit an error (500). The image or DOM might be too large for your system. Try with a smaller window.";
            }
            return "Sorry, I encountered an error: " + e.getMessage() + "\nMake sure Ollama is running (`ollama run phi3:mini`).";
        }
    }

    public List<Map<String, Object>> generateAutomationActions(String command, String screenshot, List<Map<String, Object>> dom, List<String> history, String pageText) {
        String visualSummary = "No visual analysis performed.";

        // --- STEP 1: VISION (moondream) ---
        if (screenshot != null && !screenshot.isEmpty()) {
            try {
                log.info("Two-Model Strategy: Calling moondream for visual analysis...");
                Map<String, Object> visionBody = new HashMap<>();
                visionBody.put("prompt", "Describe this webpage layout. List any quiz questions, form fields, and buttons you see. Be specific about their location relative to each other.");
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
            SYSTEM: You are a browser automation brain (phi3:mini). Using the visual analysis,
            page text transcript, and DOM map, you must respond ONLY with a JSON array of actions.
            
            Action schema:
            [
              {
                "action": "click" | "type" | "select" | "scroll" | "wait" | "keypress",
                "targetId": <data-gravity-id number or null>,
                "value": "<text to type or option to select or key name>",
                "reason": "<why this action>"
              }
            ]
            
            RULES:
            1. Use "VISUAL ANALYSIS" and "PAGE TEXT" to find the quiz answers.
            2. Match those to the correct "targetId" in the "DOM ELEMENTS" map.
            3. Fully answer all visible questions before clicking 'Submit'.
            4. If no more actions needed, return [{"action": "done"}].
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
