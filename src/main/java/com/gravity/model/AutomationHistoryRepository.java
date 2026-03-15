package com.gravity.model;

import com.gravity.model.AutomationHistory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;
import java.util.List;

@Repository
public interface AutomationHistoryRepository extends JpaRepository<AutomationHistory, Long> {
    List<AutomationHistory> findBySessionId(String sessionId);
}
