package com.gravity.controller;

import com.gravity.model.AutomationHistory;
import com.gravity.model.AutomationHistoryRepository;
import com.gravity.service.AIService;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/automation")
@RequiredArgsConstructor
public class AutomationController {

    private final AIService aiService;
    private final AutomationHistoryRepository historyRepository;

    @PostMapping("/execute")
    public List<Map<String, Object>> execute(@RequestBody AutomationRequest request) {
        // Step 2: Think (Backend logic)
        List<Map<String, Object>> actions = aiService.generateAutomationActions(
                request.getCommand(),
                request.getScreenshot(),
                request.getDom()
        );

        // Step 4: Store initial history
        AutomationHistory history = new AutomationHistory();
        history.setCommand(request.getCommand());
        history.setUrl(request.getUrl());
        // Simple serialization for storage
        try {
            history.setActionsJson(actions.toString());
        } catch (Exception e) {
            history.setActionsJson("Error serializing actions");
        }
        history.setStatus(AutomationHistory.Status.PARTIAL); // Marked SUCCESS by frontend later
        historyRepository.save(history);

        return actions;
    }

    @Data
    public static class AutomationRequest {
        private String command;
        private String screenshot;
        private List<Map<String, Object>> dom;
        private String url;
    }
}
