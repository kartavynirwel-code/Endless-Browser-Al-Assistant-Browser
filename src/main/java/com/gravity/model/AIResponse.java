package com.gravity.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AIResponse {
    private String thought;
    private String action; // click, type, scroll, navigate, extract, done
    private String target; // CSS selector or XPath or URL
    private String value;  // text to type
    private String message;
}
