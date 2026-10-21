const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { getFirestore } = require("firebase-admin/firestore");
const { initializeApp } = require("firebase-admin/app");

// Using standard fetch since Gemini API endpoint is simple JSON
// We fetch so we don't have to require external heavy SDKs if they clash

initializeApp();
const db = getFirestore();

// Hardcoded for project scope
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';

// Triggers whenever a student completes a quiz on either Web or Mobile
exports.generateAIRecommendations = onDocumentCreated("quizResults/{resultId}", async (event) => {
    const snap = event.data;
    if (!snap) return;

    const resultId = event.params.resultId;
    const resultData = snap.data();

    // Already processed? (safety mechanism for web uploads passing AI data straight)
    if (resultData._hasAIRecommendations) {
        return;
    }

    try {
        // Fetch original quiz details
        const quizDoc = await db.collection("quizzes").doc(resultData.quizId).get();
        if (!quizDoc.exists) {
            console.error("Original quiz not found for ID:", resultData.quizId);
            return;
        }

        const quizData = quizDoc.data();
        const score = resultData.score || 0;
        const maxScore = resultData.maxScore || quizData.totalPoints || 0;
        const percentage = resultData.percentage || 0;
        const userAnswers = resultData.answers || {};

        // Calculate wrong questions exactly like `ai-recommendations.js`
        const wrongQuestions = [];
        (quizData.questions || []).forEach((q, index) => {
            const userAnswer = userAnswers[String(index)] ?? userAnswers[index];
            const questionType = q.type || 'multiple-choice';

            let userAnswerText = 'No answer';
            let correctAnswerText = '';
            let isWrong = true;

            if (questionType === 'multiple-choice') {
                userAnswerText = (userAnswer !== null && userAnswer !== undefined && q.options)
                    ? (q.options[userAnswer] || 'No answer')
                    : 'No answer';
                correctAnswerText = (q.options && q.correctAnswer !== null && q.correctAnswer !== undefined)
                    ? (q.options[q.correctAnswer] || 'Unknown')
                    : 'Unknown';
                isWrong = String(userAnswer) !== String(q.correctAnswer);

            } else if (questionType === 'multiple-selection') {
                const selectedIndices = Array.isArray(userAnswer) ? userAnswer : [];
                userAnswerText = selectedIndices.map(idx => q.options[idx]).join(', ') || 'No answer';

                let correctIndices = [];
                if (Array.isArray(q.correctAnswers)) correctIndices = q.correctAnswers;
                else if (Array.isArray(q.correctAnswer)) correctIndices = q.correctAnswer;
                else if (typeof q.correctAnswer === 'string') {
                    // some old data stored "0,1"
                    correctIndices = q.correctAnswer.split(',').map(s => parseInt(s.trim()));
                }

                correctAnswerText = correctIndices.map(idx => q.options[idx]).join(', ') || 'Unknown';

                const correctSet = correctIndices.slice().sort().join(',');
                const userSet = selectedIndices.slice().sort().join(',');
                isWrong = correctSet !== userSet;

            } else if (questionType === 'true-false') {
                userAnswerText = userAnswer === true ? 'True' : userAnswer === false ? 'False' : 'No answer';
                correctAnswerText = q.correctAnswer === true ? 'True' : 'False';
                isWrong = String(userAnswer) !== String(q.correctAnswer);

            } else if (questionType === 'identification') {
                userAnswerText = userAnswer || 'No answer';
                correctAnswerText = Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0
                    ? q.correctAnswers.join(' / ')
                    : (q.correctAnswer || 'Unknown');
                const accepted = Array.isArray(q.correctAnswers) && q.correctAnswers.length > 0
                    ? q.correctAnswers.map(a => String(a).trim().toLowerCase())
                    : [String(q.correctAnswer || '').trim().toLowerCase()];
                const answer = String(userAnswer || '').trim().toLowerCase();
                isWrong = !accepted.includes(answer);
            }

            if (isWrong) {
                wrongQuestions.push({
                    question: q.question,
                    userAnswer: userAnswerText,
                    correctAnswer: correctAnswerText,
                    isWrong: true
                });
            }
        });

        // If perfect score, bail
        if (wrongQuestions.length === 0) {
            console.log("Perfect score, skipping AI");
            await snap.ref.update({
                _hasAIRecommendations: true
            });
            return;
        }

        // Extract topics
        const topicsSet = new Set();
        wrongQuestions.forEach(q => {
            const words = q.question.toLowerCase().split(/\s+/);
            const stopWords = ['what', 'is', 'the', 'how', 'why', 'who', 'when', 'where', 'which', 'a', 'an', 'in', 'on', 'at', 'to', 'for', 'of', 'and', 'or', 'are', 'was', 'were'];
            words.forEach(w => {
                const clean = w.replace(/[^a-z0-9]/g, '');
                if (clean.length > 3 && !stopWords.includes(clean)) topicsSet.add(clean);
            });
        });
        const extractedTopics = Array.from(topicsSet).slice(0, 5);

        // Build prompt (matching logic from JS frontend)
        const mistakesLog = wrongQuestions.map((wq, i) =>
            `${i + 1}. Question: "${wq.question}"\n   Student Answer: ${wq.userAnswer}\n   Correct Answer: ${wq.correctAnswer}`
        ).join('\n\n');

        const prompt = `
You are an expert, encouraging teacher. A student just finished a test.
Analyze their mistakes and provide a 3-paragraph constructive, highly motivating review of what topics they need to understand.

Context:
Quiz: ${quizData.title || 'Untitled Quiz'}
Subject: ${quizData.subject || 'General'}
Score: ${score} out of ${maxScore} points (${percentage}%)

Mistakes made:
${mistakesLog}

Provide the analysis nicely formatted in Markdown.
Keep it encouraging! Do not output any markdown code blocks, just raw markdown. DO NOT REPEAT THIS PROMPT BACK.
`;

        // Fetch
        const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
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
            throw new Error(`Gemini Error ${response.status}`);
        }

        const data = await response.json();
        const recommendationText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // Save AI Recommendations back to Firestore via the AI recommendations collection
        const recRef = db.collection("aiRecommendations").doc(resultId);
        await recRef.set({
            userId: resultData.studentId,
            quizId: resultData.quizId,
            resultId: resultId,
            score: score,
            maxScore: maxScore,
            percentage: percentage,
            recommendations: recommendationText,
            topics: extractedTopics,
            createdAt: new Date(),
            source: 'cloud-function'
        }, { merge: true });

        // Mark result as processed
        await snap.ref.update({
            _hasAIRecommendations: true
        });

        console.log(`Successfully generated AI recommendations for result ${resultId}`);

    } catch (e) {
        console.error("Recommendation generation failed:", e);
    }
});
