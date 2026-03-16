package com.gravity.service;

import com.gravity.model.AutomationSession;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class AutomationOrchestrator {

    private final VisionService visionService;
    private final ReasoningService reasoningService;
    private final SafetyService safetyService;
    private final SessionService sessionService;
    private final WebSocketService webSocketService;
    private final com.gravity.model.AutomationSessionRepository sessionRepository;

    public StepResult executeStep(String sessionId, String screenshot, 
                                   String dom, String pageText, String url) {
        log.info("Orchestrating step for session: {}", sessionId);
        
        List<String> history = sessionService.getHistory(sessionId);
        AutomationSession session = sessionRepository.findById(sessionId).orElseThrow();
        String command = session.getCommand();
        
        // SMART VISION: Only call moondream when pageText is thin
        // (means page has images/canvas with no readable text)
        String visualSummary = "Visual analysis skipped - using page text.";
        if (pageText == null || pageText.trim().length() < 300) {
            log.info("pageText is thin, calling moondream for visual help...");
            visualSummary = visionService.analyzeScreenshot(screenshot);
            webSocketService.sendUpdate("Visual Analysis: " + visualSummary);
        }

        List<Map<String, Object>> actions = reasoningService.planActions(
                command, pageText, dom, visualSummary, history);

        SafetyService.SafetyResult safety = safetyService.checkActions(actions, command);
        
        int stepNumber = history.size() + 1;
        sessionService.saveStep(sessionId, stepNumber, url, screenshot, 
                                pageText, visualSummary, actions);

        StepResult result = new StepResult();
        result.setActions(safety.getSafeActions());
        result.setStatus(safety.getStatus() == SafetyService.Status.SAFE 
                         ? "RUNNING" : "NEEDS_CONFIRMATION");
        result.setMessage(safety.getMessage());
        
        if (actions.stream().anyMatch(a -> "done".equals(a.get("action")))) {
            result.setStatus("DONE");
            sessionService.completeSession(sessionId, AutomationSession.Status.COMPLETED);
        }

        return result;
    }

    @Data
    public static class StepResult {
        private List<Map<String, Object>> actions;
        private String status;
        private String message;
    }
}
