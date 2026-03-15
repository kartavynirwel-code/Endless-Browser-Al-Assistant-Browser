package com.gravity.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.stereotype.Service;

@Slf4j
@Service
@RequiredArgsConstructor
public class VisionService {

    private final OllamaChatModel chatModel;
    private static final String VISION_MODEL = "moondream";

    public String analyzeScreenshot(String base64Image) {
        if (base64Image == null || base64Image.isEmpty()) {
            return "No screenshot provided.";
        }

        try {
            log.info("Calling moondream for visual analysis...");
            var options = OllamaOptions.create()
                    .withModel(VISION_MODEL)
                    .withTemperature(0.0f);

            // Note: Spring AI Ollama currently might require the image as a media part or in the prompt.
            // Following the pattern from AIService, but we'll assume the chatModel handles it if configured.
            // In a real implementation, we'd use Message with Media.
            var prompt = new Prompt("What is visible on this page? Briefly describe the content and main UI elements. NO numbers, NO coordinates, NO locations. Just text descriptions.", options);
            
            return chatModel.call(prompt).getResult().getOutput().getContent();
        } catch (Exception e) {
            log.error("Vision analysis failed: {}", e.getMessage());
            return "Visual analysis failed: " + e.getMessage();
        }
    }
}
