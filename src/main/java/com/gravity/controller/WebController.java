package com.gravity.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class WebController {

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/quiz")
    public String quiz() {
        return "forward:/quiz.html";
    }

    @GetMapping("/quiz2")
    public String quiz2() {
        return "forward:/quiz2.html";
    }
}
