package com.gravity.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.stereotype.Service;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final OllamaChatModel chatModel;

    public String chat(String message, String base64Image) {
        try {
            OllamaOptions options = OllamaOptions.create()
                    .withModel(base64Image != null ? "moondream" : "phi3:mini")
                    .withTemperature(0.7f);

            // Simple chat logic - if image exists, moondream is used.
            // Spring AI handles the model switch via options.
            var prompt = new Prompt(message, options);
            return chatModel.call(prompt).getResult().getOutput().getContent();
        } catch (Exception e) {
            log.error("Chat failed: ", e);
            return "Error: " + e.getMessage();
        }
    }
}
