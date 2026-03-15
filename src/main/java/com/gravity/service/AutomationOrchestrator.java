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

    public StepResult executeStep(String sessionId, String screenshot, String dom, String pageText, String url) {
        log.info("Orchestrating step for session: {}", sessionId);
        
        // 1. Get History
        List<String> history = sessionService.getHistory(sessionId);
        AutomationSession session = sessionRepository.findById(sessionId).orElseThrow();
        String command = session.getCommand();
        
        // 2. Vision
        String visualSummary = visionService.analyzeScreenshot(screenshot);
        webSocketService.sendUpdate("Visual Analysis: " + visualSummary);

        // 3. Reasoning
        List<Map<String, Object>> actions = reasoningService.planActions(
                command, 
                pageText, dom, visualSummary, history);

        // 4. Safety
        SafetyService.SafetyResult safety = safetyService.checkActions(actions, command);
        
        // 5. Save History
        int stepNumber = history.size() + 1;
        sessionService.saveStep(sessionId, stepNumber, url, screenshot, pageText, visualSummary, actions);

        // 6. Return Result
        StepResult result = new StepResult();
        result.setActions(actions);
        result.setStatus(safety.getStatus() == SafetyService.Status.SAFE ? "RUNNING" : "NEEDS_CONFIRMATION");
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
