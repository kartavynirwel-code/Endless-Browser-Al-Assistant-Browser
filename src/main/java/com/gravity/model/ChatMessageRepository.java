package com.gravity.model;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface ChatMessageRepository extends JpaRepository<ChatMessage, Long> {
    List<ChatMessage> findByUserIdOrderByTimestampAsc(Long userId);
    List<ChatMessage> findByUserIdAndSessionIdOrderByTimestampAsc(Long userId, String sessionId);
}
