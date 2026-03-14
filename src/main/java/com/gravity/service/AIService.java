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
    private static final String MODEL_NAME = "llava";

    /**
     * Calls Local Ollama API
     */
    private String callOllamaAPI(Map<String, Object> requestBody) throws Exception {
        log.info("Sending request to local Ollama API (Model: {})...", MODEL_NAME);

        return webClient.post()
                .uri(OLLAMA_URL)
                .header(HttpHeaders.CONTENT_TYPE, MediaType.APPLICATION_JSON_VALUE)
                .bodyValue(requestBody)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofMinutes(5)) // Local models can take a while
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
        requestBody.put("model", MODEL_NAME);
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
            String responseStr = callOllamaAPI(requestBody);
            return parseResponse(responseStr);

        } catch (Exception e) {
            log.error("Error calling Ollama API: ", e);
            return AIResponse.builder()
                    .action("done")
                    .message("Error calling local AI: " + e.getMessage() + ". Is Ollama running?")
                    .build();
        }
    }

    private AIResponse parseResponse(String rawResponse) throws JsonProcessingException {
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
        requestBody.put("model", MODEL_NAME);
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
            String responseStr = callOllamaAPI(requestBody);
            JsonNode root = objectMapper.readTree(responseStr);
            return root.path("response").asText();

        } catch (Exception e) {
            log.error("Error in chat: ", e);
            if (e.getMessage() != null && e.getMessage().contains("500")) {
                return "The local AI (Ollama) hit an error (500). The image or DOM might be too large for your system. Try with a smaller window.";
            }
            return "Sorry, I encountered an error: " + e.getMessage() + "\nMake sure Ollama is running (`ollama run llava`).";
        }
    }

    public List<Map<String, Object>> generateAutomationActions(String command, String screenshot, List<Map<String, Object>> dom, List<String> history) {
        String systemPrompt = """
            SYSTEM: You are a browser automation agent. You receive a webpage screenshot,
            a DOM element map (including context text), and a user command.
            You must respond ONLY with a valid JSON array of actions.
            
            Action schema:
            [
              {
                "action": "click" | "type" | "select" | "scroll" | "wait" | "keypress",
                "targetId": <data-gravity-id number or null>,
                "value": "<text to type or option to select or key name>",
                "reason": "<why this action>"
              }
            ]
            
            CRITICAL RULES:
            1. Use the "DOM MAP" to find questions. Questions are often in tags like 'p', 'label', 'span', or 'h3' with "isInterative: false" (or no ID).
            2. Match the question text to the nearest interactive elements (inputs/buttons) with an "id" and "isInteractive: true".
            3. Answer ALL questions on the page before clicking any "Submit", "Done", or "Finish" buttons.
            4. If no questions are left to answer, and the user asked to SUBMIT, then click the Submit button.
            5. If all answers are filled but no SUBMIT was requested in the command, return [{"action": "done", "reason": "Questions answered"}].
            
            Example reasoning for quiz: "I see question '1. What is Java?' in a p tag. Below it, I see an input with data-gravity-id 5. I will type the answer into targetId 5."
            """;

        if (screenshot != null && screenshot.startsWith("data:image")) {
            screenshot = screenshot.substring(screenshot.indexOf(",") + 1);
        }

        StringBuilder promptBuilder = new StringBuilder();
        promptBuilder.append("USER COMMAND: ").append(command).append("\n");
        if (history != null && !history.isEmpty()) {
            promptBuilder.append("PREVIOUS STEPS HISTORY:\n");
            history.forEach(h -> promptBuilder.append("- ").append(h).append("\n"));
        }
        promptBuilder.append("DOM MAP: ").append(dom.toString());

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("model", MODEL_NAME);
        requestBody.put("system", systemPrompt);
        requestBody.put("prompt", promptBuilder.toString());
        requestBody.put("stream", false);

        if (screenshot != null) {
            requestBody.put("images", List.of(screenshot));
        }

        try {
            String responseStr = callOllamaAPI(requestBody);
            JsonNode root = objectMapper.readTree(responseStr);
            String actionsJson = root.path("response").asText();
            
            // For JSON Arrays, manual parsing is safer than Ollama's format:json
            int start = actionsJson.indexOf("[");
            int end = actionsJson.lastIndexOf("]");
            if (start != -1 && end != -1) {
                actionsJson = actionsJson.substring(start, end + 1);
            }
            
            return objectMapper.readValue(actionsJson, List.class);
        } catch (Exception e) {
            log.error("Error generating actions: ", e);
            return List.of(Map.of("action", "done", "reason", "Error: " + e.getMessage()));
        }
    }
}
