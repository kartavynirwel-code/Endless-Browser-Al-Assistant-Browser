package com.gravity.model;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface AutomationHistoryRepository extends JpaRepository<AutomationHistory, Long> {
}
