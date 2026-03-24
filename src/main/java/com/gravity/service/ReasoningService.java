package com.gravity.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ReasoningService {

    private final OllamaChatModel chatModel;
    private final ObjectMapper objectMapper;
    private static final String TEXT_MODEL = "phi3:mini";

    public List<Map<String, Object>> planActions(String command, String pageText, 
            String dom, String visualSummary, List<String> history) {

        String systemPrompt = """
            You are a browser automation agent. 
            OUTPUT: Only a raw JSON array. Zero explanation. Zero markdown.
            
            RULES:
            1. "targetId" = exact "id" number from DOM ELEMENTS (isInteractive=true)
            2. "value" for type = ACTUAL answer text, NEVER empty string ""
            3. For radio buttons use "click" action
            4. Read PAGE TEXT carefully to find correct answers
            5. Fill ALL input fields, skip NOTHING
            6. Last action must be {"action":"done","targetId":null,"value":"","reason":"complete"}
            7. NEVER include submit button unless user said "submit"
            
            SCHEMA: [{"action":"type|click|select|scroll|navigate|done","targetId":0,"value":"text","reason":"why"}]
            
            EXAMPLE for Java quiz with 5 text inputs:
            [
              {"action":"type","targetId":0,"value":"object oriented","reason":"Q1: Java is OOP language"},
              {"action":"type","targetId":1,"value":"Machine","reason":"Q2: JVM = Java Virtual Machine"},
              {"action":"type","targetId":2,"value":"extends","reason":"Q3: inherit keyword"},
              {"action":"type","targetId":3,"value":"main","reason":"Q4: entry point is main()"},
              {"action":"type","targetId":4,"value":"independent","reason":"Q5: platform independent"},
              {"action":"done","targetId":null,"value":"","reason":"All 5 questions answered"}
            ]
            """;

        StringBuilder userPrompt = new StringBuilder();
        userPrompt.append("USER COMMAND: ").append(command).append("\n\n");
        
        if (visualSummary != null && !visualSummary.contains("skipped")) {
            userPrompt.append("VISUAL CONTEXT:\n").append(visualSummary).append("\n\n");
        }
        
        userPrompt.append("PAGE TEXT (read this to understand questions):\n")
                  .append(pageText != null ? pageText : "").append("\n\n");
        
        if (history != null && !history.isEmpty()) {
            userPrompt.append("ALREADY DONE (do not repeat):\n");
            history.forEach(h -> userPrompt.append("- ").append(h).append("\n"));
            userPrompt.append("\n");
        }
        
        userPrompt.append("DOM ELEMENTS (use 'id' as targetId, only isInteractive=true):\n")
                  .append(dom);

        var options = OllamaOptions.create()
                .withModel(TEXT_MODEL)
                .withTemperature(0.0f)
                .withNumPredict(2000);

        var prompt = new Prompt(
            List.of(
                new SystemMessage(systemPrompt),
                new UserMessage(userPrompt.toString())
            ),
            options
        );

        try {
            String response = chatModel.call(prompt).getResult().getOutput().getContent();
            log.info("AI raw response: {}", response);
            return parseActionList(response);
        } catch (Exception e) {
            log.error("Reasoning failed: ", e);
            return List.of(Map.of("action", "error", "reason", "AI failure: " + e.getMessage()));
        }
    }

    private String sanitize(String input) {
        return input; // Remove coordinates sanitization as it corrupts IDs
    }

    private List<Map<String, Object>> parseActionList(String json) throws JsonProcessingException {
        if (json == null || json.isEmpty()) {
            log.warn("Empty AI response");
            return List.of();
        }
        
        // Strip markdown code fences (various formats)
        json = json.replaceAll("(?s)```json\\s*", "")
                    .replaceAll("(?s)```\\s*", "")
                    .replaceAll("(?s)`", "")
                    .trim();
        
        // Remove any leading text before the first [
        int start = json.indexOf("[");
        int end = json.lastIndexOf("]");
        
        if (start != -1 && end != -1 && end > start) {
            String extracted = json.substring(start, end + 1);
            
            // Clean control characters that break JSON parsing
            extracted = extracted.replaceAll("[\\x00-\\x1F&&[^\\n\\r\\t]]", "");
            
            // Fix common LLM JSON mistakes
            extracted = extracted.replaceAll(",\\s*]", "]");  // trailing comma before ]
            extracted = extracted.replaceAll(",\\s*}", "}");  // trailing comma before }
            
            try {
                List<Map<String, Object>> result = objectMapper.readValue(extracted, List.class);
                log.info("Successfully parsed {} actions from AI response", result.size());
                return result;
            } catch (Exception e) {
                log.error("Failed to parse extracted JSON ({}): {}", e.getMessage(), extracted.substring(0, Math.min(200, extracted.length())));
            }
        }
        
        // Fallback: try parsing the whole response
        try {
            json = json.replaceAll("[\\x00-\\x1F&&[^\\n\\r\\t]]", "");
            return objectMapper.readValue(json, List.class);
        } catch (Exception e) {
            log.error("Could not parse AI response as JSON. Response: {}", json.substring(0, Math.min(300, json.length())));
        }
        
        // Final fallback: try to extract individual JSON objects
        try {
            List<Map<String, Object>> results = new java.util.ArrayList<>();
            java.util.regex.Pattern pattern = java.util.regex.Pattern.compile("\\{[^{}]+\\}");
            java.util.regex.Matcher matcher = pattern.matcher(json);
            while (matcher.find()) {
                try {
                    Map<String, Object> action = objectMapper.readValue(matcher.group(), Map.class);
                    if (action.containsKey("action") || action.containsKey("type")) {
                        results.add(action);
                    }
                } catch (Exception ignored) {}
            }
            if (!results.isEmpty()) {
                log.info("Extracted {} actions via individual object parsing", results.size());
                return results;
            }
        } catch (Exception ignored) {}
        
        return List.of(Map.of("action", "error", "reason", "AI produced invalid response format"));
    }
}
