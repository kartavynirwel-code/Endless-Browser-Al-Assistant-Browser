package com.gravity.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.chat.messages.Media;
import org.springframework.ai.ollama.OllamaChatModel;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;

import java.util.Base64;
import java.util.List;

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
            
            // Clean base64 string
            String cleanImg = base64Image.contains(",") 
                ? base64Image.substring(base64Image.indexOf(",") + 1) 
                : base64Image;

            byte[] imageBytes = java.util.Base64.getDecoder().decode(cleanImg);
            
            var media = new Media(MimeTypeUtils.IMAGE_JPEG, new ByteArrayResource(imageBytes));
            var userMessage = new UserMessage(
                "Describe the page content briefly. What forms, questions, or UI elements are visible? No coordinates.",
                List.of(media)
            );

            var options = OllamaOptions.create()
                    .withModel(VISION_MODEL)
                    .withTemperature(0.0f);

            var prompt = new Prompt(List.of(userMessage), options);
            return chatModel.call(prompt).getResult().getOutput().getContent();

        } catch (Exception e) {
            log.error("Vision failed: {}", e.getMessage());
            return "Visual analysis unavailable.";
        }
    }
}
