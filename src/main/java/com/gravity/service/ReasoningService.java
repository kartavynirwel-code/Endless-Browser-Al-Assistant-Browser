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
            You are a browser automation agent for ANY website.
            Your ONLY output must be a raw JSON array of actions. 
            No explanation. No markdown. No text before or after.
            
            ACTION TYPES:
            - "type"   → fill a text input. "value" = exact text to type. NEVER empty.
            - "click"  → click a radio button, checkbox, button, or link.
                         For radio/checkbox: "value" = the option text to select.
            - "select" → choose from a dropdown. "value" = option text.
            - "scroll" → scroll page. "value" = pixels (e.g. 400).
            - "navigate" → go to a URL. "value" = full URL like "https://youtube.com"
              Use this when user says "go to", "open", "search on" a website.
            - "done"   → task is complete, stop.
            
            CRITICAL RULES:
            1. "targetId" MUST be the exact "id" number from DOM ELEMENTS 
               where isInteractive=true. NEVER guess or invent IDs.
            2. For text inputs: "value" MUST contain the ACTUAL answer. 
               NEVER leave value as "" or null.
            3. For radio buttons: use "click" action on the correct option's id.
            4. For MCQ: read PAGE TEXT carefully to identify correct answer,
               then click the matching radio button targetId.
            5. Match EACH question in PAGE TEXT to its input field in DOM ELEMENTS
               by reading nearby text/labels.
            6. Fill ALL fields. Do NOT skip any question.
            7. Do NOT include submit/send button in actions unless user said "submit".
            
            OUTPUT FORMAT EXAMPLE:
            [
              {"action":"type","targetId":3,"value":"object oriented","reason":"Q1: Java language type"},
              {"action":"type","targetId":6,"value":"Machine","reason":"Q2: JVM stands for"},
              {"action":"click","targetId":12,"value":"CSS","reason":"Q3: styling language is CSS"},
              {"action":"done","targetId":null,"value":"","reason":"All questions answered"}
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
        int start = json.indexOf("[");
        int end = json.lastIndexOf("]");
        if (start != -1 && end != -1) {
            json = json.substring(start, end + 1);
            return objectMapper.readValue(json, List.class);
        }
        return List.of();
    }
}
