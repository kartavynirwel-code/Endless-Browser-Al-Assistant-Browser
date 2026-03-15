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
public class ChatService {

    private final OllamaChatModel chatModel;

    public String chat(String message, String base64Image) {
        try {
            boolean hasImage = base64Image != null && !base64Image.isEmpty();
            OllamaOptions options = OllamaOptions.create()
                    .withModel(hasImage ? "moondream" : "phi3:mini")
                    .withTemperature(0.7f);

            Prompt prompt;
            if (hasImage) {
                log.info("Chat with image using moondream...");
                String imagePayload = base64Image;
                if (imagePayload.contains(",")) {
                    imagePayload = imagePayload.substring(imagePayload.indexOf(",") + 1);
                }
                byte[] imageBytes = Base64.getDecoder().decode(imagePayload);
                var media = new Media(MimeTypeUtils.IMAGE_JPEG, new ByteArrayResource(imageBytes));
                var userMessage = new UserMessage(message, List.of(media));
                prompt = new Prompt(userMessage, options);
            } else {
                prompt = new Prompt(message, options);
            }

            ChatResponse response = chatModel.call(prompt);
            return response.getResult().getOutput().getContent();
        } catch (Exception e) {
            log.error("Chat failed: ", e);
            return "Error: " + e.getMessage();
        }
    }
}
