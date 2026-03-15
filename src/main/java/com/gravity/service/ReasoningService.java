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

    public List<Map<String, Object>> planActions(String command, String pageText, String dom, String visualSummary, List<String> history) {
        String systemPrompt = """
            You are an Expert Web Automation & Intelligence Agent. 
            You must analyze the VISUAL layout, the full PAGE TEXT transcript, and the technical DOM elements to fulfill the USER COMMAND.
            
            GOAL: Efficiently and accurately complete the user's request on any website.
            
            OPERATIONAL RULES:
            1. CLARITY: Use "PAGE TEXT" and "label/labelText" in "DOM ELEMENTS" to understand which input belongs to which question.
            2. MAPPING: Match your intended action to the correct data-gravity-id.
            3. GARBAGE FILTER: IGNORE numerical coordinates. Focus on context only.
            4. ACTION TYPES: 'type', 'click', 'select', 'scroll'.
            5. ACCURACY: Provide the exact answers for quizzes or professional values for forms.
            6. OUTPUT: Respond ONLY with the JSON array. DO NOT repeat the prompt.
            
            Action schema:
            [{"action":"type|click|select|scroll","targetId":0,"value":"text","reason":"why"}]
            """;

        StringBuilder userPrompt = new StringBuilder();
        userPrompt.append("USER COMMAND: ").append(command).append("\n\n");
        userPrompt.append("VISUAL ANALYSIS:\n").append(visualSummary).append("\n\n");
        userPrompt.append("PAGE TEXT:\n").append(pageText).append("\n\n");
        if (history != null && !history.isEmpty()) {
            userPrompt.append("HISTORY:\n");
            history.forEach(h -> userPrompt.append("- ").append(h).append("\n"));
        }
        userPrompt.append("\nDOM ELEMENTS:\n").append(dom);

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
            return parseActionList(sanitize(response));
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
