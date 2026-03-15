package com.gravity.service;

import com.gravity.model.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class SessionService {

    private final AutomationSessionRepository sessionRepository;
    private final AutomationHistoryRepository historyRepository;

    @Transactional
    public AutomationSession startSession(String command) {
        AutomationSession session = new AutomationSession();
        session.setCommand(command);
        session.setStatus(AutomationSession.Status.RUNNING);
        return sessionRepository.save(session);
    }

    @Transactional
    public void saveStep(String sessionId, int stepNumber, String url, String screenshot, 
                         String pageText, String visualSummary, List<Map<String, Object>> actions) {
        AutomationHistory history = new AutomationHistory();
        history.setSessionId(sessionId);
        history.setStepNumber(stepNumber);
        history.setUrl(url);
        history.setVisualSummary(visualSummary);
        history.setPageText(pageText);
        history.setActionsJson(actions.toString());
        history.setStatus(AutomationHistory.Status.PARTIAL);
        historyRepository.save(history);

        AutomationSession session = sessionRepository.findById(sessionId).orElseThrow();
        session.setUpdatedAt(LocalDateTime.now());
        sessionRepository.save(session);
    }

    public List<String> getHistory(String sessionId) {
        return historyRepository.findBySessionId(sessionId)
                .stream()
                .map(h -> "Step " + h.getStepNumber() + ": " + h.getActionsJson())
                .collect(Collectors.toList());
    }

    @Transactional
    public void completeSession(String sessionId, AutomationSession.Status status) {
        AutomationSession session = sessionRepository.findById(sessionId).orElseThrow();
        session.setStatus(status);
        session.setUpdatedAt(LocalDateTime.now());
        sessionRepository.save(session);
    }
}
