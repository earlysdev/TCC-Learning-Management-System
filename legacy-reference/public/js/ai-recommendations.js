// ========================================
// AI Recommendations Module
// Using Google Gemini API
// ========================================

// TODO: Replace with your Gemini API key
// Get from: https://aistudio.google.com/apikey
const GEMINI_API_KEY = ''; // Keep AI provider keys on the server, never in browser code.
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

/**
 * Generate personalized study recommendations based on quiz performance
 * @param {Object} quizData - Quiz performance data
 * @returns {Promise<Object>} Recommendations object with text and topics
 */
// Rate-limit cooldown: if we get a 429, skip API calls until retry window passes
let _apiCooldownUntil = 0;

/**
 * Generate personalized study recommendations based on quiz performance
 * @param {Object} quizData - Quiz performance data
 * @returns {Promise<Object>} Recommendations object with text and topics
 */
async function generateRecommendations(quizData) {
    try {
        const { quizTitle, subject, score, maxScore, percentage, wrongQuestions, totalQuestions } = quizData;

        // If we are within a known rate-limit cooldown window, skip the API entirely
        if (Date.now() < _apiCooldownUntil) {
            const remainingSec = Math.ceil((_apiCooldownUntil - Date.now()) / 1000);
            console.warn(`AI Recommendations: Gemini API is rate-limited. Using fallback for ~${remainingSec}s more.`);
            return generateFallbackRecommendations(quizData);
        }

        // Build prompt for AI
        const prompt = buildPrompt(quizTitle, subject, score, maxScore, percentage, wrongQuestions, totalQuestions);

        // Call Gemini API
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 800,
                    topP: 0.95,
                    topK: 40
                }
            })
        });

        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            const errMsg = errData?.error?.message || response.statusText;

            if (response.status === 429) {
                // Extract retry delay from the error message if present (e.g. "retry in 42.14s")
                const retryMatch = errMsg.match(/retry in ([\d.]+)s/i);
                const retrySeconds = retryMatch ? parseFloat(retryMatch[1]) : 60;
                _apiCooldownUntil = Date.now() + retrySeconds * 1000;

                // Expected when free-tier quota is 0 — use warn, not error
                console.warn(
                    `AI Recommendations: Gemini API quota exceeded (free tier limit reached).\n` +
                    `Fallback recommendations will be used for the next ${Math.ceil(retrySeconds)}s.\n` +
                    `To enable real AI: set up billing at https://ai.google.dev/gemini-api/docs/rate-limits`
                );
                return generateFallbackRecommendations(quizData);
            }

            throw new Error(`API request failed: ${response.status} — ${errMsg}`);
        }

        // Success: clear any previous cooldown
        _apiCooldownUntil = 0;

        const data = await response.json();

        // Extract recommendation text
        const recommendationText = data.candidates[0]?.content?.parts[0]?.text ||
            'Unable to generate recommendations at this time.';

        // Extract topics from wrong questions
        const topics = extractTopics(wrongQuestions);

        return {
            text: recommendationText,
            topics: topics
        };

    } catch (error) {
        console.error('AI Recommendations Error:', error);

        // Fallback to basic recommendations if API fails
        return generateFallbackRecommendations(quizData);
    }
}

/**
 * Build detailed prompt for AI
 */
function buildPrompt(quizTitle, subject, score, maxScore, percentage, wrongQuestions, totalQuestions) {
    const wrongQuestionsList = wrongQuestions.length > 0
        ? wrongQuestions.map(q => `- ${q.question}\n  Student answered: ${q.userAnswer}\n  Correct answer: ${q.correctAnswer}`).join('\n')
        : 'None — all answers were correct!';

    const subjectLine = subject ? `Subject: ${subject}` : '';

    return `You are a helpful educational AI assistant for Filipino high school students at Tagoloan Community College.

A student just completed a quiz:

Quiz Title: ${quizTitle}
${subjectLine}
Score: ${score} out of ${maxScore} points (${percentage}%)
Total Questions: ${totalQuestions}
Incorrect Answers: ${wrongQuestions.length}

${wrongQuestions.length > 0 ? `Questions Answered Incorrectly:\n${wrongQuestionsList}` : ''}

Please provide personalized study recommendations that include:

1. **Overall Assessment** — A brief, honest evaluation of their performance (2-3 sentences)
2. **Topics to Focus On** — Specific concepts or topics from the incorrect answers to review
3. **Study Strategies** — 3-4 actionable, practical tips tailored to the subject and performance level
4. **Encouragement** — A warm, motivating closing message

Keep the tone friendly, encouraging, and specific. Avoid generic advice — reference the actual quiz topics where possible. Write in clear sections.`;
}


function extractTopics(wrongQuestions) {
    if (wrongQuestions.length === 0) return ['Excellent Performance'];

    const topics = wrongQuestions.map(q => {
        const words = q.question.split(' ').slice(0, 5).join(' ');
        return words.length > 30 ? words.substring(0, 27) + '...' : words;
    });

    return [...new Set(topics)].slice(0, 5);
}

function generateFallbackRecommendations(quizData) {
    const { quizTitle, score, maxScore, percentage, wrongQuestions, totalQuestions } = quizData;

    let assessment = '';
    let strategies = '';
    let encouragement = '';

    if (percentage >= 85) {
        assessment = `Excellent work on "${quizTitle}"! You scored ${percentage}%, demonstrating a strong understanding of the material.`;
        strategies = `To maintain this level:
• Continue practicing regularly
• Challenge yourself with advanced topics
• Help peers who are struggling`;
        encouragement = 'Keep up the outstanding work! Your dedication is paying off.';
    } else if (percentage >= 75) {
        assessment = `Good job on "${quizTitle}"! You scored ${percentage}%, showing solid understanding with room for improvement.`;
        strategies = `To improve further:
• Review the ${wrongQuestions.length} questions you missed
• Focus on understanding the concepts, not just memorizing
• Practice similar problems`;
        encouragement = 'You\'re on the right track! Keep studying and you\'ll see even better results.';
    } else if (percentage >= 60) {
        assessment = `You scored ${percentage}% on "${quizTitle}". There's room for improvement, but you're making progress.`;
        strategies = `To strengthen your understanding:
• Spend extra time reviewing the topics you missed
• Ask your teacher for clarification on difficult concepts
• Form a study group with classmates
• Practice with additional exercises`;
        encouragement = 'Don\'t be discouraged! With focused effort, you can master this material.';
    } else {
        assessment = `You scored ${percentage}% on "${quizTitle}". This quiz was challenging, but every challenge is an opportunity to learn.`;
        strategies = `To improve:
• Review all quiz topics thoroughly
• Meet with your teacher for one-on-one help
• Break down complex topics into smaller parts
• Set aside dedicated study time each day
• Use additional resources like videos or tutorials`;
        encouragement = 'Remember, learning is a journey. With persistence and the right approach, you will improve!';
    }

    const topicsToReview = wrongQuestions.length > 0
        ? `\n\nTopics to Review:\n${wrongQuestions.map((q, i) => `${i + 1}. ${q.question.split(' ').slice(0, 8).join(' ')}...`).join('\n')}`
        : '';

    return {
        text: `${assessment}\n\n${strategies}${topicsToReview}\n\n${encouragement}`,
        topics: extractTopics(wrongQuestions)
    };
}

window.aiRecommendations = {
    generateRecommendations
};
