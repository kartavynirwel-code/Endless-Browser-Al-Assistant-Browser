package com.gravity.service;

import com.gravity.model.ChatMessage;
import com.gravity.model.ChatMessageRepository;
import com.gravity.model.User;
import com.gravity.model.UserRepository;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.memory.ChatMemory;
import org.springframework.ai.chat.messages.AssistantMessage;
import org.springframework.ai.chat.messages.Message;
import org.springframework.ai.chat.messages.Media;
import org.springframework.ai.chat.messages.SystemMessage;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.ollama.api.OllamaOptions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.util.MimeTypeUtils;
import reactor.core.publisher.Flux;

import java.util.ArrayList;
import java.util.Base64;
import java.util.List;

@Service
public class ChatService {
    private static final Logger log = LoggerFactory.getLogger(ChatService.class);

    private final ChatModel chatModel;
    private final ChatMemory chatMemory;
    
    @Autowired
    private ChatMessageRepository chatMessageRepository;
    
    @Autowired
    private UserRepository userRepository;

    public ChatService(ChatModel chatModel, ChatMemory chatMemory) {
        this.chatModel = chatModel;
        this.chatMemory = chatMemory;
    }

    public Flux<String> streamChat(String sessionId, String message, String base64Image) {
        log.info("[STREAM CHAT] Received request for session: {}. Message length: {}", sessionId, message != null ? message.length() : 0);
        try {
            boolean hasImage = base64Image != null && !base64Image.isEmpty();
            String model = hasImage ? "moondream:latest" : "phi3:mini";
            
            OllamaOptions options = OllamaOptions.create()
                    .withModel(model)
                    .withTemperature(0.7f);

            log.info("[STREAM CHAT] Using model: {} (Image: {})", model, hasImage);

            List<Message> messages = new ArrayList<>();
            messages.add(new SystemMessage("You are Endless Assistant, a helpful and concise AI built into the Endless browser. Answer questions accurately."));
            messages.addAll(chatMemory.get(sessionId, 5)); // Keep last 5 for context
            
            Message userMessage;
            if (hasImage) {
                String imagePayload = base64Image;
                if (imagePayload.contains(",")) {
                    imagePayload = imagePayload.substring(imagePayload.indexOf(",") + 1);
                }
                byte[] imageBytes = Base64.getDecoder().decode(imagePayload);
                var media = new Media(MimeTypeUtils.IMAGE_JPEG, new ByteArrayResource(imageBytes));
                userMessage = new UserMessage(message, List.of(media));
            } else {
                userMessage = new UserMessage(message);
            }

            messages.add(userMessage);
            chatMemory.add(sessionId, userMessage);

            // Save to Persistent History
            savePersistentMessage(sessionId, "user", message);

            Prompt prompt = new Prompt(messages, options);
            
            StringBuilder fullResponse = new StringBuilder();
            
            return chatModel.stream(prompt)
                .map(response -> {
                    String content = response.getResult().getOutput().getContent();
                    if (content != null) {
                        fullResponse.append(content);
                    }
                    return content != null ? content : "";
                })
                .doOnComplete(() -> {
                    if (fullResponse.length() > 0) {
                        String finalContent = fullResponse.toString();
                        chatMemory.add(sessionId, new AssistantMessage(finalContent));
                        savePersistentMessage(sessionId, "assistant", finalContent);
                    }
                })
                .doOnError(e -> log.error("Streaming chat failed: ", e));

        } catch (Exception e) {
            log.error("Chat setup failed: ", e);
            return Flux.just("Error: " + e.getMessage());
        }
    }

    public String chat(String sessionId, String message, String base64Image) {
        try {
            boolean hasImage = base64Image != null && !base64Image.isEmpty();
            String model = hasImage ? "moondream:latest" : "phi3:mini";
            
            OllamaOptions options = OllamaOptions.create()
                    .withModel(model)
                    .withTemperature(0.7f);

            List<Message> messages = new ArrayList<>(chatMemory.get(sessionId, 10)); // Get last 10 messages
            
            Message userMessage;
            if (hasImage) {
                log.info("Chat with image using moondream session: {}", sessionId);
                String imagePayload = base64Image;
                if (imagePayload.contains(",")) {
                    imagePayload = imagePayload.substring(imagePayload.indexOf(",") + 1);
                }
                byte[] imageBytes = Base64.getDecoder().decode(imagePayload);
                var media = new Media(MimeTypeUtils.IMAGE_JPEG, new ByteArrayResource(imageBytes));
                userMessage = new UserMessage(message, List.of(media));
            } else {
                userMessage = new UserMessage(message);
            }

            messages.add(userMessage);
            chatMemory.add(sessionId, userMessage);
            savePersistentMessage(sessionId, "user", message);

            Prompt prompt = new Prompt(messages, options);
            ChatResponse response = chatModel.call(prompt);
            
            String reply = response.getResult().getOutput().getContent();
            chatMemory.add(sessionId, new AssistantMessage(reply));
            savePersistentMessage(sessionId, "assistant", reply);
            
            return reply;
        } catch (Exception e) {
            log.error("Chat failed: ", e);
            return "Error: " + e.getMessage();
        }
    }

    private void savePersistentMessage(String sessionId, String role, String content) {
        try {
            var auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth != null && auth.isAuthenticated() && auth.getPrincipal() instanceof UserDetails) {
                Object principal = auth.getPrincipal();
                String username = ((UserDetails) principal).getUsername();
                User user = userRepository.findByUsername(username).orElse(null);
                if (user != null) {
                    ChatMessage msg = new ChatMessage(user.getId(), sessionId, role, content);
                    chatMessageRepository.save(msg);
                }
            }
        } catch (Exception e) {
            log.error("Failed to save persistent message: ", e);
        }
    }
}
