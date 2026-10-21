// ========================================
// Quiz Taking Logic
// Supports: Multiple Choice, Identification, True/False
// ========================================

// Protect this page
if (!firebaseApp.protectPage('student')) {
    // Will redirect if not authenticated
}

const currentUser = firebaseApp.getCurrentUser();

// Get quiz ID from URL
const urlParams = new URLSearchParams(window.location.search);
const quizId = urlParams.get('id');
const viewMode = urlParams.get('view'); // 'results' for review mode

if (!quizId) {
    firebaseApp.showToast('No quiz ID provided', 'error');
    window.location.href = firebaseApp.getRoute('student');
}

// State
let currentQuiz = null;
let currentQuestionIndex = 0;
let userAnswers = [];
let startTime = Date.now();
let timerInterval = null;
let isReadonly = false; // For overdue quizzes
let restoredFromSave = false; // Whether progress was restored from localStorage

// DOM Elements
const quizTitleEl = document.getElementById('quizTitle');
const timerDisplayEl = document.getElementById('timerDisplay');
const currentQuestionEl = document.getElementById('currentQuestion');
const totalQuestionsEl = document.getElementById('totalQuestions');
const progressFillEl = document.getElementById('progressFill');
const quizContentEl = document.getElementById('quizContent');
const prevBtnEl = document.getElementById('prevBtn');
const nextBtnEl = document.getElementById('nextBtn');
const submitBtnEl = document.getElementById('submitBtn');
const resultsModalEl = document.getElementById('resultsModal');

// ========================================
// Initialize Quiz
// ========================================

async function initQuiz() {
    try {
        // Show loading
        quizContentEl.innerHTML = `
      <div class="quiz-loading">
        <div class="spinner"></div>
        <h2>Loading Quiz...</h2>
      </div>
    `;

        // Load quiz from Firestore
        const quizDoc = await firebaseApp.db.collection(firebaseApp.collections.quizzes).doc(quizId).get();

        if (!quizDoc.exists) {
            throw new Error('Quiz not found');
        }

        currentQuiz = { id: quizDoc.id, ...quizDoc.data() };

        // Check if quiz has questions
        if (!currentQuiz.questions || currentQuiz.questions.length === 0) {
            quizContentEl.innerHTML = `
                <div class="quiz-loading">
                    <h2>⚠️ This quiz has no questions yet</h2>
                    <p>The teacher may still be preparing this quiz.</p>
                    <a href="student-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Back to Dashboard</a>
                </div>
            `;
            return;
        }

        // Check if this is readonly mode (overdue quiz) 
        if (viewMode === 'readonly') {
            isReadonly = true;
        }

        // Also check deadline even if accessed directly (not via readonly link)
        if (currentQuiz.deadline && viewMode !== 'results') {
            const deadlineDate = currentQuiz.deadline.toDate ? currentQuiz.deadline.toDate() : new Date(currentQuiz.deadline);
            if (deadlineDate < new Date()) {
                isReadonly = true;
            }
        }

        // Check if user already completed this quiz
        const resultsSnapshot = await firebaseApp.db.collection(firebaseApp.collections.quizResults)
            .where('studentId', '==', currentUser.uid)
            .where('quizId', '==', quizId)
            .get();

        if (!resultsSnapshot.empty && viewMode !== 'results') {
            // Student already completed — redirect silently to results view
            firebaseApp.showToast('✅ You already completed this quiz. Showing your results.', 'info');
            setTimeout(() => {
                window.location.href = `${firebaseApp.getRoute('quiz')}?id=${quizId}&view=results`;
            }, 1200);
            return;
        }

        // Initialize original indices
        currentQuiz.questions.forEach((q, i) => q.originalIndex = i);

        // Try to restore saved progress from localStorage
        const savedProgress = loadProgressFromLocalStorage();

        if (savedProgress && !isReadonly && viewMode !== 'results') {
            // Restore saved question order
            const reorderedQuestions = [];
            let orderValid = true;
            for (const origIdx of savedProgress.questionOrder) {
                const q = currentQuiz.questions.find(q => q.originalIndex === origIdx);
                if (q) {
                    reorderedQuestions.push(q);
                } else {
                    orderValid = false;
                    break;
                }
            }

            if (orderValid && reorderedQuestions.length === currentQuiz.questions.length) {
                currentQuiz.questions = reorderedQuestions;
                userAnswers = savedProgress.userAnswers;
                currentQuestionIndex = savedProgress.currentQuestionIndex || 0;
                if (savedProgress.quizStartTime) {
                    startTime = savedProgress.quizStartTime;
                }
                restoredFromSave = true;
                firebaseApp.showToast('📝 Your previous answers have been restored.', 'info');
            } else {
                // Saved order doesn't match — quiz may have been edited, start fresh
                clearProgressFromLocalStorage();
                userAnswers = new Array(currentQuiz.questions.length).fill(null);
                if (currentQuiz.randomizeQuestions && viewMode !== 'results') {
                    for (let i = currentQuiz.questions.length - 1; i > 0; i--) {
                        const j = Math.floor(Math.random() * (i + 1));
                        [currentQuiz.questions[i], currentQuiz.questions[j]] = [currentQuiz.questions[j], currentQuiz.questions[i]];
                    }
                }
            }
        } else {
            if (currentQuiz.randomizeQuestions && viewMode !== 'results' && !isReadonly) {
                for (let i = currentQuiz.questions.length - 1; i > 0; i--) {
                    const j = Math.floor(Math.random() * (i + 1));
                    [currentQuiz.questions[i], currentQuiz.questions[j]] = [currentQuiz.questions[j], currentQuiz.questions[i]];
                }
            }

            // Initialize answers array
            userAnswers = new Array(currentQuiz.questions.length).fill(null);
        }

        // Set up UI
        quizTitleEl.textContent = currentQuiz.title;
        totalQuestionsEl.textContent = currentQuiz.questions.length;

        // If readonly, add banner and hide submit
        if (isReadonly) {
            document.querySelector('.quiz-container').classList.add('quiz-readonly');

            // Add overdue banner before quiz content
            const banner = document.createElement('div');
            banner.className = 'quiz-overdue-banner';
            banner.innerHTML = '⚠️ This quiz is past its deadline. You can review all questions and see the correct answers below. Submission is disabled.';
            quizContentEl.parentElement.insertBefore(banner, quizContentEl);

            // Hide timer for readonly
            const timerEl = document.getElementById('timer');
            if (timerEl) timerEl.style.display = 'none';

            // Always hide submit button in readonly
            submitBtnEl.style.display = 'none';
        }

        // Check if quiz is scheduled and hasn't started yet
        if (currentQuiz.status === 'scheduled' && currentQuiz.scheduledDate && currentQuiz.scheduledStartTime) {
            const startDateTime = new Date(`${currentQuiz.scheduledDate}T${currentQuiz.scheduledStartTime}`);
            const now = new Date();
            if (now < startDateTime) {
                // Quiz hasn't started yet — block with a message
                const diffMs = startDateTime - now;
                const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                let countdownText = '';
                if (diffHrs > 24) {
                    const days = Math.floor(diffHrs / 24);
                    countdownText = `${days} day${days > 1 ? 's' : ''}`;
                } else if (diffHrs > 0) {
                    countdownText = `${diffHrs}h ${diffMins}m`;
                } else {
                    countdownText = `${diffMins} minutes`;
                }

                quizContentEl.innerHTML = `
                    <div class="quiz-loading">
                        <h2>🔒 Quiz Not Available Yet</h2>
                        <p>This quiz is scheduled to start on <strong>${startDateTime.toLocaleString()}</strong></p>
                        <p style="margin-top:0.5rem;color:var(--primary-400);">⏰ Starts in: ${countdownText}</p>
                        <a href="student-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Back to Dashboard</a>
                    </div>
                `;
                return;
            }
        }

        // Start timer (only for active quizzes)
        if (!isReadonly) {
            // Check for scheduled duration-based timer
            if (currentQuiz.status === 'scheduled' && currentQuiz.scheduledDuration && currentQuiz.scheduledDate && currentQuiz.scheduledStartTime) {
                const startDateTime = new Date(`${currentQuiz.scheduledDate}T${currentQuiz.scheduledStartTime}`);
                const endDateTime = new Date(startDateTime.getTime() + currentQuiz.scheduledDuration * 60 * 1000);
                const now = new Date();
                const remainingMs = endDateTime - now;

                if (remainingMs <= 0) {
                    // Duration has elapsed
                    isReadonly = true;
                    quizContentEl.innerHTML = `
                        <div class="quiz-loading">
                            <h2>⏰ Quiz Duration Has Ended</h2>
                            <p>The scheduled duration for this quiz has elapsed.</p>
                            <a href="student-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Back to Dashboard</a>
                        </div>
                    `;
                    return;
                }

                // Start countdown timer based on remaining duration
                if (!startTime) startTime = Date.now();
                saveProgressToLocalStorage();
                const remainingSec = Math.floor(remainingMs / 1000);
                startDurationTimer(remainingSec);
            } else if (currentQuiz.timeLimit && currentQuiz.timeLimit > 0) {
                // Regular time-limited quiz countdown
                if (!startTime) startTime = Date.now();
                
                // Calculate elapsed time from the very first start
                const elapsedSinceStart = Math.floor((Date.now() - startTime) / 1000);
                let remainingSec = (currentQuiz.timeLimit * 60) - elapsedSinceStart;
                
                if (remainingSec <= 0) {
                    remainingSec = 0;
                }
                
                saveProgressToLocalStorage();
                startDurationTimer(remainingSec);
            } else {
                if (!startTime) startTime = Date.now();
                saveProgressToLocalStorage();
                startTimer();
            }
        } else {
            timerDisplayEl.textContent = '—';
        }

        // Log quiz start
        if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
            activityTracker.logActivity('quiz_start', {
                quizId: quizId,
                quizTitle: currentQuiz.title
            });
        }

        // Render first question
        renderQuestion();

    } catch (error) {
        console.error('Error loading quiz:', error);
        firebaseApp.showToast('Failed to load quiz: ' + (error.message || 'Unknown error'), 'error');
        quizContentEl.innerHTML = `
            <div class="quiz-loading">
                <h2>❌ Failed to load quiz</h2>
                <p>${error.message || 'Please try again later.'}</p>
                <a href="student-dashboard.html" class="btn btn-primary" style="margin-top: 1rem;">Back to Dashboard</a>
            </div>
        `;
    }
}

// ========================================
// Auto-Save Progress (localStorage)
// ========================================

/**
 * Save current quiz progress to localStorage.
 * Saves: answers, question order, current question index.
 */
function saveProgressToLocalStorage() {
    if (!quizId || !currentQuiz || isReadonly) return;
    try {
        const progress = {
            quizId: quizId,
            studentId: currentUser.uid,
            userAnswers: userAnswers,
            currentQuestionIndex: currentQuestionIndex,
            questionOrder: currentQuiz.questions.map(q => q.originalIndex),
            quizStartTime: startTime,
            savedAt: Date.now()
        };
        localStorage.setItem(`quiz-progress-${quizId}`, JSON.stringify(progress));
    } catch (e) {
        console.warn('[QuizAutoSave] Failed to save progress:', e);
    }
}

/**
 * Load saved quiz progress from localStorage.
 * Returns the saved object or null if not found / expired / wrong student.
 */
function loadProgressFromLocalStorage() {
    if (!quizId) return null;
    try {
        const raw = localStorage.getItem(`quiz-progress-${quizId}`);
        if (!raw) return null;
        const progress = JSON.parse(raw);

        // Validate: must be same quiz and same student
        if (progress.quizId !== quizId) return null;
        if (progress.studentId && progress.studentId !== currentUser.uid) return null;

        // Expire after 24 hours
        if (progress.savedAt && (Date.now() - progress.savedAt) > 24 * 60 * 60 * 1000) {
            localStorage.removeItem(`quiz-progress-${quizId}`);
            return null;
        }

        return progress;
    } catch (e) {
        console.warn('[QuizAutoSave] Failed to load progress:', e);
        return null;
    }
}

/**
 * Clear saved quiz progress from localStorage.
 */
function clearProgressFromLocalStorage() {
    if (!quizId) return;
    try {
        localStorage.removeItem(`quiz-progress-${quizId}`);
    } catch (e) {
        console.warn('[QuizAutoSave] Failed to clear progress:', e);
    }
}

// ========================================
// Timer
// ========================================

function startTimer() {
    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        timerDisplayEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }
}

// Duration-based countdown timer for scheduled quizzes
function startDurationTimer(totalSeconds) {
    let remaining = totalSeconds;
    const timerEl = document.getElementById('timer');

    // Show the timer display with countdown styling
    if (timerEl) timerEl.style.display = '';
    timerDisplayEl.style.color = '';

    timerInterval = setInterval(() => {
        remaining--;
        const minutes = Math.floor(remaining / 60);
        const seconds = remaining % 60;
        timerDisplayEl.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

        // Visual warning when under 60 seconds
        if (remaining <= 60) {
            timerDisplayEl.style.color = '#ef4444';
            timerDisplayEl.style.fontWeight = 'bold';
        }

        if (remaining <= 0) {
            clearInterval(timerInterval);
            timerDisplayEl.textContent = '00:00';
            // Auto-submit the quiz
            firebaseApp.showToast('⏰ Time is up! Auto-submitting your quiz...', 'error');
            
            // Immediately disable interactions to prevent last-second clicks
            const quizContainer = document.querySelector('.quiz-container');
            if (quizContainer) quizContainer.style.pointerEvents = 'none';
            
            setTimeout(() => {
                processQuizSubmission(true);
            }, 500);
        }
    }, 1000);
}

// ========================================
// Render Question (supports all 3 types)
// ========================================

function renderQuestion() {
    const question = currentQuiz.questions[currentQuestionIndex];
    const questionType = question.type || 'multiple-choice';

    currentQuestionEl.textContent = currentQuestionIndex + 1;

    // Update progress bar
    const progress = ((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100;
    progressFillEl.style.width = `${progress}%`;

    let questionHTML = '';

    const typeBadges = {
        'multiple-choice': '📝 Multiple Choice',
        'multiple-selection': '☑️ Multiple Selection',
        'true-false': '✅ True or False',
        'identification': '✍️ Identification',
        'essay': '✏️ Essay'
    };

    if (questionType === 'multiple-choice') {
        questionHTML = renderMultipleChoiceQuestion(question);
    } else if (questionType === 'multiple-selection') {
        questionHTML = renderMultipleSelectionQuestion(question);
    } else if (questionType === 'true-false') {
        questionHTML = renderTrueFalseQuestion(question);
    } else if (questionType === 'identification') {
        questionHTML = renderIdentificationQuestion(question);
    } else if (questionType === 'essay') {
        questionHTML = renderEssayQuestion(question);
    } else {
        if (question.options && question.options.length > 0) {
            questionHTML = renderMultipleChoiceQuestion(question);
        } else {
            questionHTML = renderIdentificationQuestion(question);
        }
    }

    quizContentEl.innerHTML = `
    <div class="question-card">
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
        <span class="question-number">Question ${currentQuestionIndex + 1}</span>
        <span class="question-type-badge" style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 20px; background: var(--primary-100, #e0e7ff); color: var(--primary-700, #4338ca); font-weight: 600;">
            ${typeBadges[questionType] || questionType}
        </span>
      </div>
      <h2 class="question-text">${question.question}</h2>
      ${questionHTML}
    </div>
  `;

    // Add event listeners based on type
    if (questionType === 'multiple-choice' || questionType === 'true-false') {
        document.querySelectorAll('.option-input').forEach(input => {
            input.addEventListener('change', (e) => {
                if (questionType === 'true-false') {
                    userAnswers[currentQuestionIndex] = e.target.value === 'true';
                } else {
                    userAnswers[currentQuestionIndex] = parseInt(e.target.value);
                }
                saveProgressToLocalStorage();
            });
        });
    } else if (questionType === 'multiple-selection') {
        document.querySelectorAll('.ms-option-input').forEach(input => {
            input.addEventListener('change', () => {
                const checked = Array.from(document.querySelectorAll('.ms-option-input:checked')).map(c => parseInt(c.value));
                userAnswers[currentQuestionIndex] = checked.length > 0 ? checked : null;
                saveProgressToLocalStorage();
            });
        });
    } else if (questionType === 'identification') {
        const textInput = document.getElementById('identificationAnswer');
        if (textInput) {
            textInput.addEventListener('input', (e) => {
                userAnswers[currentQuestionIndex] = e.target.value.trim();
                saveProgressToLocalStorage();
            });
            textInput.focus();
        }
    } else if (questionType === 'essay') {
        const essayInput = document.getElementById('essayAnswer');
        if (essayInput) {
            essayInput.addEventListener('input', (e) => {
                userAnswers[currentQuestionIndex] = e.target.value.trim();
                saveProgressToLocalStorage();
            });
            essayInput.focus();
        }
    }

    // Update navigation buttons
    prevBtnEl.disabled = currentQuestionIndex === 0;

    if (isReadonly) {
        // In readonly mode: only show Prev/Next for browsing — never show Submit
        nextBtnEl.classList.remove('hidden');
        submitBtnEl.classList.add('hidden');
        // Hide Next on last question (nothing to submit)
        if (currentQuestionIndex === currentQuiz.questions.length - 1) {
            nextBtnEl.classList.add('hidden');
        }
    } else if (currentQuestionIndex === currentQuiz.questions.length - 1) {
        nextBtnEl.classList.add('hidden');
        submitBtnEl.classList.remove('hidden');
    } else {
        nextBtnEl.classList.remove('hidden');
        submitBtnEl.classList.add('hidden');
    }
}

// --- Multiple Choice ---
function renderMultipleChoiceQuestion(question) {
    if (!question.options || question.options.length === 0) {
        return '<p style="color: var(--gray-500);">No options available for this question.</p>';
    }

    if (isReadonly) {
        // Show correct answer highlighted in green
        const correctIndex = question.correctAnswer; // 0-based index
        return `
          <div class="options-list">
            ${question.options.map((option, index) => {
            const isCorrect = index === correctIndex;
            const borderStyle = isCorrect ? 'border:2px solid #22c55e;' : 'border:2px solid transparent;opacity:0.5;';
            const bgStyle = isCorrect ? 'background:rgba(34,197,94,0.12);' : '';
            const letterBg = isCorrect ? 'background:#22c55e;color:white;' : '';
            const label = isCorrect ? ' <span style="color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:0.5rem;">✅ Correct Answer</span>' : '';
            return `
                  <div class="option-item" style="${borderStyle}${bgStyle}border-radius:10px;margin-bottom:0.5rem;cursor:default;">
                    <label class="option-label" style="cursor:default;">
                      <span class="option-letter" style="${letterBg}">${String.fromCharCode(65 + index)}</span>
                      <span>${option}</span>${label}
                    </label>
                  </div>`;
        }).join('')}
          </div>
        `;
    }

    return `
      <div class="options-list">
        ${question.options.map((option, index) => `
          <div class="option-item">
            <input 
              type="radio" 
              id="option${index}" 
              name="answer" 
              value="${index}"
              class="option-input"
              ${userAnswers[currentQuestionIndex] === index ? 'checked' : ''}
            >
            <label for="option${index}" class="option-label">
              <span class="option-letter">${String.fromCharCode(65 + index)}</span>
              <span>${option}</span>
            </label>
          </div>
        `).join('')}
      </div>
    `;
}

// --- Multiple Selection ---
function renderMultipleSelectionQuestion(question) {
    if (!question.options || question.options.length === 0) {
        return '<p style="color: var(--gray-500);">No options available for this question.</p>';
    }

    if (isReadonly) {
        // correctAnswers is an array of correct indices
        const correctIndices = Array.isArray(question.correctAnswers) ? question.correctAnswers : [];
        return `
          <p style="font-size:0.82rem;color:#22c55e;margin:0 0 0.75rem;font-style:italic;">✅ Correct answers are highlighted below.</p>
          <div class="options-list">
            ${question.options.map((option, index) => {
            const isCorrect = correctIndices.includes(index);
            const borderStyle = isCorrect ? 'border:2px solid #22c55e;' : 'border:2px solid transparent;opacity:0.5;';
            const bgStyle = isCorrect ? 'background:rgba(34,197,94,0.12);' : '';
            const letterBg = isCorrect ? 'background:#22c55e;color:white;' : '';
            const label = isCorrect ? ' <span style="color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:0.5rem;">✅</span>' : '';
            return `
                  <div class="option-item" style="${borderStyle}${bgStyle}border-radius:10px;margin-bottom:0.5rem;cursor:default;">
                    <label class="option-label" style="cursor:default;">
                      <span class="option-letter" style="${letterBg}">${String.fromCharCode(65 + index)}</span>
                      <span>${option}</span>${label}
                    </label>
                  </div>`;
        }).join('')}
          </div>
        `;
    }

    const savedAnswers = Array.isArray(userAnswers[currentQuestionIndex]) ? userAnswers[currentQuestionIndex] : [];
    return `
      <p style="font-size:0.82rem;color:var(--primary-400);margin:0 0 0.75rem;font-style:italic;">Select all that apply.</p>
      <div class="options-list">
        ${question.options.map((option, index) => `
          <div class="option-item">
            <input 
              type="checkbox" 
              id="ms-option${index}" 
              name="ms-answer" 
              value="${index}"
              class="ms-option-input"
              style="width:18px;height:18px;accent-color:var(--primary-500);flex-shrink:0;cursor:pointer;"
              ${savedAnswers.includes(index) ? 'checked' : ''}
            >
            <label for="ms-option${index}" class="option-label">
              <span class="option-letter">${String.fromCharCode(65 + index)}</span>
              <span>${option}</span>
            </label>
          </div>
        `).join('')}
      </div>
    `;
}

// --- True or False ---
function renderTrueFalseQuestion(question) {
    if (isReadonly) {
        // question.correctAnswer is true/false boolean or 'true'/'false' string
        const correct = question.correctAnswer === true || question.correctAnswer === 'true';
        const trueStyle = correct
            ? 'border:2px solid #22c55e;background:rgba(34,197,94,0.12);border-radius:10px;'
            : 'border:2px solid transparent;opacity:0.5;border-radius:10px;';
        const falseStyle = !correct
            ? 'border:2px solid #22c55e;background:rgba(34,197,94,0.12);border-radius:10px;'
            : 'border:2px solid transparent;opacity:0.5;border-radius:10px;';
        const trueLetterBg = correct ? 'background:#22c55e;color:white;' : '';
        const falseLetterBg = !correct ? 'background:#22c55e;color:white;' : '';
        return `
          <div class="options-list">
            <div class="option-item" style="${trueStyle}margin-bottom:0.5rem;cursor:default;">
              <label class="option-label" style="cursor:default;">
                <span class="option-letter" style="${trueLetterBg}">T</span>
                <span>True</span>
                ${correct ? '<span style="color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:0.5rem;">✅ Correct Answer</span>' : ''}
              </label>
            </div>
            <div class="option-item" style="${falseStyle}cursor:default;">
              <label class="option-label" style="cursor:default;">
                <span class="option-letter" style="${falseLetterBg}">F</span>
                <span>False</span>
                ${!correct ? '<span style="color:#22c55e;font-size:0.75rem;font-weight:700;margin-left:0.5rem;">✅ Correct Answer</span>' : ''}
              </label>
            </div>
          </div>
        `;
    }

    const currentAnswer = userAnswers[currentQuestionIndex];
    return `
      <div class="options-list">
        <div class="option-item">
          <input 
            type="radio" 
            id="optionTrue" 
            name="answer" 
            value="true"
            class="option-input"
            ${currentAnswer === true ? 'checked' : ''}
          >
          <label for="optionTrue" class="option-label">
            <span class="option-letter" style="background: #22c55e; color: white;">T</span>
            <span>True</span>
          </label>
        </div>
        <div class="option-item">
          <input 
            type="radio" 
            id="optionFalse" 
            name="answer" 
            value="false"
            class="option-input"
            ${currentAnswer === false ? 'checked' : ''}
          >
          <label for="optionFalse" class="option-label">
            <span class="option-letter" style="background: #ef4444; color: white;">F</span>
            <span>False</span>
          </label>
        </div>
      </div>
    `;
}

// --- Identification ---
function renderIdentificationQuestion(question) {
    if (isReadonly) {
        const correctAnswer = question.correctAnswer || question.answer || '—';
        return `
          <div style="margin-top:1.5rem;">
            <div style="padding:1rem 1.25rem;border-radius:12px;background:rgba(34,197,94,0.1);border:2px solid #22c55e;">
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#22c55e;margin-bottom:0.4rem;">✅ Correct Answer</div>
              <div style="font-size:1.15rem;font-weight:700;color:var(--gray-100);">${correctAnswer}</div>
            </div>
            <small style="color:var(--gray-400,#9ca3af);margin-top:0.5rem;display:block;">Answer is case-insensitive</small>
          </div>
        `;
    }

    const currentAnswer = userAnswers[currentQuestionIndex] || '';
    return `
      <div class="identification-input-group" style="margin-top: 1.5rem;">
        <label for="identificationAnswer" class="form-label" style="font-size: 0.9rem; margin-bottom: 0.5rem; display: block; color: var(--gray-600, #6b7280);">
            Type your answer below:
        </label>
        <input 
          type="text" 
          id="identificationAnswer" 
          class="form-input identification-quiz-input"
          placeholder="Type your answer here..."
          value="${currentAnswer}"
          autocomplete="off"
          style="width: 100%; padding: 1rem; font-size: 1.1rem; border: 2px solid var(--gray-300, #d1d5db); border-radius: 12px; transition: border-color 0.2s;"
        >
        <small style="color: var(--gray-400, #9ca3af); margin-top: 0.5rem; display: block;">Answer is case-insensitive</small>
      </div>
    `;
}

// --- Essay ---
function renderEssayQuestion(question) {
    if (isReadonly) {
        const modelAnswer = question.modelAnswer || question.correctAnswer || question.answer || null;
        return `
          <div style="margin-top:1.5rem;">
            <div style="padding:1rem 1.25rem;border-radius:12px;background:rgba(34,197,94,0.08);border:2px solid rgba(34,197,94,0.4);">
              <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#22c55e;margin-bottom:0.5rem;">✅ Model Answer</div>
              ${modelAnswer
                ? `<div style="font-size:0.95rem;color:var(--gray-100);line-height:1.6;white-space:pre-wrap;">${modelAnswer}</div>`
                : `<div style="color:var(--gray-400);font-style:italic;">No model answer provided — essay is graded manually by the teacher.</div>`
            }
            </div>
            <small style="color:var(--gray-400,#9ca3af);margin-top:0.4rem;display:block;">✏️ Essay answers are graded manually by the teacher.</small>
          </div>
        `;
    }

    const currentAnswer = userAnswers[currentQuestionIndex] || '';
    return `
      <div style="margin-top:1.5rem;">
        <label for="essayAnswer" style="font-size:0.9rem;margin-bottom:0.5rem;display:block;color:var(--gray-600,#6b7280);">Write your answer below:</label>
        <textarea
          id="essayAnswer"
          class="form-input"
          rows="6"
          placeholder="Write your essay answer here..."
          style="width:100%;resize:vertical;font-size:1rem;">${currentAnswer}</textarea>
        <small style="color:var(--gray-400,#9ca3af);margin-top:0.4rem;display:block;">✏️ Essay answers are graded manually by the teacher.</small>
      </div>
    `;
}

// ========================================
// Navigation
// ========================================

prevBtnEl.addEventListener('click', () => {
    if (currentQuestionIndex > 0) {
        currentQuestionIndex--;
        saveProgressToLocalStorage();
        renderQuestion();
    }
});

/**
 * Check if the current question has been answered.
 * Returns true if answered, false if not.
 */
function isCurrentQuestionAnswered() {
    const answer = userAnswers[currentQuestionIndex];
    if (answer === null || answer === undefined) return false;
    if (Array.isArray(answer)) return answer.length > 0;
    if (typeof answer === 'string') return answer.trim().length > 0;
    return true; // boolean (true/false), number (0 is valid)
}

nextBtnEl.addEventListener('click', () => {
    if (currentQuestionIndex < currentQuiz.questions.length - 1) {
        // Skip answer requirement in readonly mode
        if (!isReadonly && !isCurrentQuestionAnswered()) {
            firebaseApp.showToast('⚠️ Please answer this question before moving on.', 'error');
            return;
        }
        currentQuestionIndex++;
        saveProgressToLocalStorage();
        renderQuestion();
    }
});

// ========================================
// Submit Quiz
// ========================================

submitBtnEl.addEventListener('click', () => processQuizSubmission(false));

async function processQuizSubmission(isAutoSubmit = false) {
    // Block submission for readonly/overdue quizzes
    if (isReadonly) {
        if (!isAutoSubmit) firebaseApp.showToast('This quiz is past its deadline and cannot be submitted.', 'error');
        return;
    }

    // ── HARD BLOCK: All questions must be answered (skip if auto-submitting) ──
    const unansweredIndices = [];
    userAnswers.forEach((a, i) => {
        if (a === null || a === undefined || a === '') {
            unansweredIndices.push(i);
        }
    });

    if (!isAutoSubmit && unansweredIndices.length > 0) {
        const firstUnanswered = unansweredIndices[0];

        // Navigate to the first unanswered question
        currentQuestionIndex = firstUnanswered;
        renderQuestion();

        // Highlight the question card to draw attention
        const questionCard = document.querySelector('.question-card, .quiz-question-container, [class*="question"]');
        if (questionCard) {
            questionCard.style.boxShadow = '0 0 0 3px #ef4444';
            questionCard.style.transition = 'box-shadow 0.2s';
            setTimeout(() => {
                questionCard.style.boxShadow = '';
            }, 2000);
        }

        // Show a clear error toast
        firebaseApp.showToast(
            `⚠️ Please answer all questions before submitting. You have ${unansweredIndices.length} unanswered question${unansweredIndices.length > 1 ? 's' : ''}.`,
            'error'
        );
        return;  // Hard block — do NOT proceed with submission
    }
    // ────────────────────────────────────────────────────────────────

    submitBtnEl.disabled = true;
    submitBtnEl.textContent = 'Submitting...';

    try {
        // Stop timer
        stopTimer();
        const timeTaken = Math.floor((Date.now() - startTime) / 1000);

        // Un-shuffle userAnswers and questions to match original order for grading and saving
        const originalUserAnswers = new Array(currentQuiz.questions.length).fill(null);
        userAnswers.forEach((ans, i) => {
            originalUserAnswers[currentQuiz.questions[i].originalIndex] = ans;
        });

        const originalQuestions = new Array(currentQuiz.questions.length).fill(null);
        currentQuiz.questions.forEach((q, i) => {
            originalQuestions[q.originalIndex] = q;
        });
        currentQuiz.questions = originalQuestions;
        userAnswers = originalUserAnswers;

        // Calculate score — handle all question types
        let score = 0;
        let maxScore = 0;

        currentQuiz.questions.forEach((question, index) => {
            const points = question.points || 1;
            maxScore += (question.type === 'essay') ? 0 : points; // essay not auto-scored

            const userAnswer = userAnswers[index];
            const questionType = question.type || 'multiple-choice';

            if (userAnswer === null || userAnswer === undefined || userAnswer === '') {
                return; // Unanswered
            }

            if (questionType === 'multiple-choice') {
                if (userAnswer === question.correctAnswer) {
                    score += points;
                }
            } else if (questionType === 'multiple-selection') {
                // Correct only if exact set matches
                const correctSet = (question.correctAnswer || []).slice().sort().join(',');
                const userSet = (Array.isArray(userAnswer) ? userAnswer : []).slice().sort().join(',');
                if (correctSet === userSet) score += points;
            } else if (questionType === 'true-false') {
                if (userAnswer === question.correctAnswer) {
                    score += points;
                }
            } else if (questionType === 'identification') {
                const answer = String(userAnswer || '').trim().toLowerCase();
                // Support multi-answer: correctAnswers[] array with fallback to single correctAnswer
                const accepted = Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0
                    ? question.correctAnswers.map(a => String(a).trim().toLowerCase())
                    : [String(question.correctAnswer || '').trim().toLowerCase()];
                if (accepted.includes(answer)) {
                    score += points;
                }
            }
            // essay: 0 auto-score, manually graded
        });

        const percentage = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;

        // Get quiz status
        const status = firebaseApp.getQuizStatus(currentQuiz.deadline, true);

        // Save result to Firestore
        // Convert answers array to a map (object) keyed by index.
        // This avoids Firestore's "nested arrays not supported" error
        // that occurs when multiple-selection answers (arrays) are stored
        // inside the top-level answers array.
        const answersMap = {};
        userAnswers.forEach((ans, idx) => {
            answersMap[idx] = ans;
        });

        const resultData = {
            quizId: quizId,
            studentId: currentUser.uid,
            studentName: `${currentUser.firstName} ${currentUser.lastName}`,
            answers: answersMap,
            score: score,
            maxScore: maxScore,
            percentage: percentage,
            submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
            timeTaken: timeTaken,
            status: status
        };

        const resultRef = await firebaseApp.db.collection(firebaseApp.collections.quizResults).add(resultData);

        // Clear saved progress from localStorage on successful submission
        clearProgressFromLocalStorage();

        // Log quiz submission
        if (window.activityTracker && typeof activityTracker.logActivity === 'function') {
            activityTracker.logActivity('quiz_taken', {
                quizId: quizId,
                quizTitle: currentQuiz.title,
                score: score,
                percentage: percentage
            });
        }

        // Deactivate screenshot blocker since quiz is done
        if (window.screenshotBlocker && typeof screenshotBlocker.deactivate === 'function') {
            screenshotBlocker.deactivate();
        }

        // Show results
        showResults(score, maxScore, percentage);

        // Generate AI recommendations (non-blocking)
        generateAIRecommendations(resultRef.id, score, maxScore, percentage);

    } catch (error) {
        console.error('Error submitting quiz:', error);
        firebaseApp.showToast('Failed to submit quiz: ' + (error.message || 'Unknown error'), 'error');
        submitBtnEl.disabled = false;
        submitBtnEl.textContent = 'Submit Quiz';
    }
}

// ========================================
// Security Action
// ========================================

window.randomizeQuestions = function () {
    if (!currentQuiz || isReadonly) return;

    // Shuffle currentQuiz.questions and userAnswers simultaneously
    for (let i = currentQuiz.questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [currentQuiz.questions[i], currentQuiz.questions[j]] = [currentQuiz.questions[j], currentQuiz.questions[i]];
        [userAnswers[i], userAnswers[j]] = [userAnswers[j], userAnswers[i]];
    }

    // Keep the student on the same question if possible, or reset to 0
    currentQuestionIndex = 0;
    renderQuestion();
};

// ========================================
// Show Results
// ========================================

function showResults(score, maxScore, percentage) {
    let correctCount = 0;
    currentQuiz.questions.forEach((question, index) => {
        const userAnswer = userAnswers[index];
        const questionType = question.type || 'multiple-choice';

        if (userAnswer === null || userAnswer === undefined || userAnswer === '') return;

        if (questionType === 'multiple-choice') {
            if (userAnswer === question.correctAnswer) correctCount++;
        } else if (questionType === 'true-false') {
            if (userAnswer === question.correctAnswer) correctCount++;
        } else if (questionType === 'identification') {
            const correct = String(question.correctAnswer || '').trim().toLowerCase();
            const answer = String(userAnswer || '').trim().toLowerCase();
            if (answer === correct) correctCount++;
        }
    });

    document.getElementById('finalPercentage').textContent = `${percentage}%`;
    document.getElementById('correctAnswers').textContent = correctCount;
    document.getElementById('totalQuestionsResult').textContent = currentQuiz.questions.length;
    document.getElementById('finalScore').textContent = score;
    document.getElementById('maxScore').textContent = maxScore;

    resultsModalEl.classList.remove('hidden');

    // Hide Review button if teacher disabled review
    const reviewBtn = document.getElementById('reviewBtn');
    if (reviewBtn) {
        if (currentQuiz.allowReview === false) {
            reviewBtn.style.display = 'none';
        } else {
            reviewBtn.style.display = '';
        }
    }
}

// ========================================
// Generate AI Recommendations
// ========================================

async function generateAIRecommendations(resultId, score, maxScore, percentage) {
    try {
        // Get wrong questions — handle all types
        const wrongQuestions = currentQuiz.questions
            .map((q, index) => {
                const userAnswer = userAnswers[index];
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
                    isWrong = userAnswer !== q.correctAnswer;

                } else if (questionType === 'multiple-selection') {
                    const selectedIndices = Array.isArray(userAnswer) ? userAnswer : [];
                    userAnswerText = selectedIndices.map(idx => q.options[idx]).join(', ') || 'No answer';
                    const correctIndices = Array.isArray(q.correctAnswers) ? q.correctAnswers : (Array.isArray(q.correctAnswer) ? q.correctAnswer : []);
                    correctAnswerText = correctIndices.map(idx => q.options[idx]).join(', ') || 'Unknown';
                    
                    const correctSet = correctIndices.slice().sort().join(',');
                    const userSet = selectedIndices.slice().sort().join(',');
                    isWrong = correctSet !== userSet;

                } else if (questionType === 'true-false') {
                    userAnswerText = userAnswer === true ? 'True' : userAnswer === false ? 'False' : 'No answer';
                    correctAnswerText = q.correctAnswer === true ? 'True' : 'False';
                    isWrong = userAnswer !== q.correctAnswer;

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

                return {
                    question: q.question,
                    userAnswer: userAnswerText,
                    correctAnswer: correctAnswerText,
                    isWrong: isWrong
                };
            })
            .filter(q => q.isWrong);

        // Use AI recommendations module
        if (window.aiRecommendations && typeof window.aiRecommendations.generateRecommendations === 'function') {
            const recommendations = await window.aiRecommendations.generateRecommendations({
                quizTitle: currentQuiz.title,
                subject: currentQuiz.subject || '',
                score: score,
                maxScore: maxScore,
                percentage: percentage,
                wrongQuestions: wrongQuestions,
                totalQuestions: currentQuiz.questions.length
            });

            // Save to Firestore
            await firebaseApp.db.collection(firebaseApp.collections.aiRecommendations).add({
                studentId: currentUser.uid,
                quizId: quizId,
                resultId: resultId,
                recommendations: recommendations.text,
                topics: recommendations.topics || [],
                generatedAt: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Display recommendations
            const recommendationsContent = document.getElementById('aiRecommendationsContent');
            if (recommendationsContent) {
                // Parse markdown basic formatting
                let htmlContent = recommendations.text
                    .replace(/\n\n/g, '<br><br>')
                    .replace(/\n/g, '<br>')
                    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                    .replace(/\*(.*?)\*/g, '<em>$1</em>')
                    .replace(/(?:- |• )(.*?)<br>/g, '<li style="margin-left:1.5rem;margin-bottom:0.25rem;">$1</li>');
                
                // Wrap stray list items in ul
                if (htmlContent.includes('<li')) {
                    htmlContent = htmlContent.replace(/(<li.*<\/li>)/s, '<ul style="margin-top:0.5rem;margin-bottom:0.5rem;">$1</ul>');
                }

                recommendationsContent.innerHTML = htmlContent;
                recommendationsContent.classList.remove('hidden');
            }
            const loadingEl = document.querySelector('.recommendations-loading');
            if (loadingEl) loadingEl.classList.add('hidden');
        } else {
            // AI module not available
            const loadingEl = document.querySelector('.recommendations-loading');
            if (loadingEl) loadingEl.textContent = 'AI recommendations module not available.';
        }

    } catch (error) {
        console.error('Error generating recommendations:', error);
        const loadingEl = document.querySelector('.recommendations-loading');
        if (loadingEl) {
            loadingEl.textContent = 'Failed to generate recommendations. Please try again later.';
        }
    }
}

// ========================================
// Review Answers (supports all types)
// ========================================

document.getElementById('reviewBtn').addEventListener('click', () => {
    resultsModalEl.classList.add('hidden');
    currentQuestionIndex = 0;
    renderReviewMode();
});

function renderReviewMode() {
    const question = currentQuiz.questions[currentQuestionIndex];
    const questionType = question.type || 'multiple-choice';
    const userAnswer = userAnswers[currentQuestionIndex];
    const correctAnswer = question.correctAnswer;

    currentQuestionEl.textContent = currentQuestionIndex + 1;

    const progress = ((currentQuestionIndex + 1) / currentQuiz.questions.length) * 100;
    progressFillEl.style.width = `${progress}%`;

    const typeBadges = {
        'multiple-choice': '📝 Multiple Choice',
        'multiple-selection': '☑️ Multiple Selection',
        'true-false': '✅ True or False',
        'identification': '✍️ Identification',
        'essay': '✏️ Essay'
    };

    let reviewHTML = '';

    if (isReadonly) {
        // In readonly mode: show questions but NO correct answers revealed
        if (questionType === 'multiple-choice' || questionType === 'multiple-selection') {
            reviewHTML = `<div class="options-list">${(question.options || []).map((opt, i) => `
                <div class="option-item">
                    <label class="option-label">
                        <span class="option-letter">${String.fromCharCode(65 + i)}</span>
                        <span>${opt}</span>
                    </label>
                </div>`).join('')}</div>
                <p style="color:var(--error-500,#ef4444);font-size:0.85rem;margin-top:0.75rem;">⚠️ Correct answers are not available for overdue quizzes.</p>`;
        } else if (questionType === 'true-false') {
            reviewHTML = `<div class="options-list">
                <div class="option-item"><label class="option-label"><span class="option-letter" style="background:#22c55e;color:white;">T</span><span>True</span></label></div>
                <div class="option-item"><label class="option-label"><span class="option-letter" style="background:#ef4444;color:white;">F</span><span>False</span></label></div>
            </div><p style="color:var(--error-500,#ef4444);font-size:0.85rem;margin-top:0.75rem;">⚠️ Correct answers are not available for overdue quizzes.</p>`;
        } else {
            reviewHTML = `<p style="color:var(--error-500,#ef4444);font-size:0.85rem;">⚠️ Answers are not available for overdue quizzes.</p>`;
        }
    } else {
        if (questionType === 'multiple-choice') {
            reviewHTML = renderMCReview(question, userAnswer, correctAnswer);
        } else if (questionType === 'multiple-selection') {
            reviewHTML = renderMSReview(question, userAnswer, correctAnswer);
        } else if (questionType === 'true-false') {
            reviewHTML = renderTFReview(question, userAnswer, correctAnswer);
        } else if (questionType === 'identification') {
            reviewHTML = renderIdReview(question, userAnswer, correctAnswer);
        } else if (questionType === 'essay') {
            reviewHTML = renderEssayReview(question, userAnswer);
        }
    }

    quizContentEl.innerHTML = `
    <div class="question-card">
      <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 1rem;">
        <span class="question-number">Question ${currentQuestionIndex + 1}</span>
        <span class="question-type-badge" style="font-size: 0.75rem; padding: 0.2rem 0.6rem; border-radius: 20px; background: var(--primary-100, #e0e7ff); color: var(--primary-700, #4338ca); font-weight: 600;">
            ${typeBadges[questionType] || questionType}
        </span>
      </div>
      <h2 class="question-text">${question.question}</h2>
      ${reviewHTML}
    </div>
  `;

    prevBtnEl.disabled = currentQuestionIndex === 0;
    nextBtnEl.classList.remove('hidden');
    submitBtnEl.classList.add('hidden');
    nextBtnEl.textContent = currentQuestionIndex === currentQuiz.questions.length - 1 ? 'Finish Review' : 'Next';

    nextBtnEl.onclick = () => {
        if (currentQuestionIndex < currentQuiz.questions.length - 1) {
            currentQuestionIndex++;
            renderReviewMode();
        } else {
            window.location.href = firebaseApp.getRoute('student');
        }
    };

    prevBtnEl.onclick = () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            renderReviewMode();
        }
    };
}

// --- Multiple Choice Review ---
function renderMCReview(question, userAnswer, correctAnswer) {
    if (!question.options) return '<p>No options available</p>';

    return `
      <div class="options-list">
        ${question.options.map((option, index) => {
        let labelClass = 'option-label';
        let icon = '';
        if (index === correctAnswer) {
            labelClass += ' correct';
            icon = ' ✓';
        } else if (index === userAnswer && userAnswer !== correctAnswer) {
            labelClass += ' incorrect';
            icon = ' ✗';
        }

        return `
            <div class="option-item">
              <input 
                type="radio" 
                id="option${index}" 
                name="answer" 
                value="${index}"
                class="option-input"
                ${userAnswer === index ? 'checked' : ''}
                disabled
              >
              <label for="option${index}" class="${labelClass}">
                <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                <span>${option}${icon}</span>
              </label>
            </div>
          `;
    }).join('')}
      </div>
    `;
}

// --- True/False Review ---
function renderTFReview(question, userAnswer, correctAnswer) {
    const isCorrect = userAnswer === correctAnswer;

    const trueClass = correctAnswer === true ? 'option-label correct'
        : (userAnswer === true && !isCorrect ? 'option-label incorrect' : 'option-label');
    const falseClass = correctAnswer === false ? 'option-label correct'
        : (userAnswer === false && !isCorrect ? 'option-label incorrect' : 'option-label');

    return `
      <div class="options-list">
        <div class="option-item">
          <input type="radio" id="optionTrue" name="answer" value="true" class="option-input" ${userAnswer === true ? 'checked' : ''} disabled>
          <label for="optionTrue" class="${trueClass}">
            <span class="option-letter" style="background: #22c55e; color: white;">T</span>
            <span>True ${correctAnswer === true ? '✓' : (userAnswer === true && !isCorrect ? '✗' : '')}</span>
          </label>
        </div>
        <div class="option-item">
          <input type="radio" id="optionFalse" name="answer" value="false" class="option-input" ${userAnswer === false ? 'checked' : ''} disabled>
          <label for="optionFalse" class="${falseClass}">
            <span class="option-letter" style="background: #ef4444; color: white;">F</span>
            <span>False ${correctAnswer === false ? '✓' : (userAnswer === false && !isCorrect ? '✗' : '')}</span>
          </label>
        </div>
      </div>
    `;
}

// --- Identification Review ---
function renderIdReview(question, userAnswer, correctAnswer) {
    const answer = String(userAnswer || '').trim().toLowerCase();
    // Support multi-answer correctAnswers[] array
    const accepted = Array.isArray(question.correctAnswers) && question.correctAnswers.length > 0
        ? question.correctAnswers.map(a => String(a).trim().toLowerCase())
        : [String(correctAnswer || '').trim().toLowerCase()];
    const isCorrect = accepted.includes(answer);
    const displayAccepted = Array.isArray(question.correctAnswers) && question.correctAnswers.length > 1
        ? question.correctAnswers.join(' <span style="color:var(--gray-500);font-size:0.8rem;">or</span> ')
        : (question.correctAnswer || correctAnswer || '—');

    return `
      <div class="identification-review" style="margin-top: 1.5rem;">
        <div style="padding: 1rem; border-radius: 12px; margin-bottom: 0.75rem; background: ${isCorrect ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; border: 2px solid ${isCorrect ? '#22c55e' : '#ef4444'};">
            <div style="font-size: 0.8rem; font-weight: 600; color: ${isCorrect ? '#22c55e' : '#ef4444'}; margin-bottom: 0.25rem;">
                ${isCorrect ? '✓ Your Answer (Correct!)' : '✗ Your Answer (Incorrect)'}
            </div>
            <div style="font-size: 1.1rem; font-weight: 500;">${userAnswer || '<em>No answer</em>'}</div>
        </div>
        ${!isCorrect ? `
        <div style="padding: 1rem; border-radius: 12px; background: rgba(34, 197, 94, 0.1); border: 2px solid #22c55e;">
            <div style="font-size: 0.8rem; font-weight: 600; color: #22c55e; margin-bottom: 0.25rem;">✓ Accepted Answer${accepted.length > 1 ? 's' : ''}</div>
            <div style="font-size: 1.1rem; font-weight: 500;">${displayAccepted}</div>
        </div>` : ''}
      </div>
    `;
}

// --- Multiple Selection Review ---
function renderMSReview(question, userAnswer, correctAnswer) {
    if (!question.options) return '<p>No options available</p>';
    const userSet = Array.isArray(userAnswer) ? userAnswer : [];
    const correctSet = Array.isArray(correctAnswer) ? correctAnswer : [];

    return `
      <div class="options-list">
        ${question.options.map((option, index) => {
        const isCorrectOption = correctSet.includes(index);
        const isUserSelected = userSet.includes(index);
        let labelClass = 'option-label';
        let icon = '';
        if (isCorrectOption) { labelClass += ' correct'; icon = ' ✓'; }
        else if (isUserSelected && !isCorrectOption) { labelClass += ' incorrect'; icon = ' ✗'; }
        return `
            <div class="option-item">
              <input type="checkbox" id="ms-r${index}" value="${index}" class="ms-option-input"
                style="width:18px;height:18px;accent-color:var(--primary-500);flex-shrink:0;"
                ${isUserSelected ? 'checked' : ''} disabled>
              <label for="ms-r${index}" class="${labelClass}">
                <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                <span>${option}${icon}</span>
              </label>
            </div>`;
    }).join('')}
      </div>
    `;
}

// --- Essay Review ---
function renderEssayReview(question, userAnswer) {
    const hasAnswer = userAnswer && String(userAnswer).trim().length > 0;
    return `
      <div style="margin-top:1.5rem;">
        <div style="padding:1rem;border-radius:12px;background:rgba(99,102,241,0.08);border:2px solid var(--primary-300,#a5b4fc);margin-bottom:0.75rem;">
            <div style="font-size:0.8rem;font-weight:600;color:var(--primary-400);margin-bottom:0.25rem;">✍️ Your Answer</div>
            <div style="font-size:1rem;line-height:1.6;">${hasAnswer ? String(userAnswer).replace(/\n/g, '<br>') : '<em style="color:var(--gray-500);">No answer provided</em>'}</div>
        </div>
        ${question.modelAnswer ? `
        <div style="padding:1rem;border-radius:12px;background:rgba(34,197,94,0.08);border:2px solid #22c55e;">
            <div style="font-size:0.8rem;font-weight:600;color:#22c55e;margin-bottom:0.25rem;">📋 Model Answer (Teacher Reference)</div>
            <div style="font-size:1rem;line-height:1.6;">${String(question.modelAnswer).replace(/\n/g, '<br>')}</div>
        </div>` : ''}
        <p style="font-size:0.82rem;color:var(--gray-400);margin-top:0.6rem;">✏️ Essay questions are graded manually by the teacher. Your score may be updated later.</p>
      </div>
    `;
}

// ========================================
// Question Randomization (for tab changes)
// ========================================

function randomizeQuestions() {
    if (!currentQuiz || !currentQuiz.questions) return;

    // Save current answers with question IDs
    const answersMap = {};
    currentQuiz.questions.forEach((question, index) => {
        if (userAnswers[index] !== null && userAnswers[index] !== undefined && userAnswers[index] !== '') {
            answersMap[question.question] = userAnswers[index];
        }
    });

    // Shuffle questions using Fisher-Yates algorithm
    const questions = [...currentQuiz.questions];
    for (let i = questions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [questions[i], questions[j]] = [questions[j], questions[i]];
    }

    currentQuiz.questions = questions;

    // Restore answers to new positions
    userAnswers = new Array(currentQuiz.questions.length).fill(null);
    currentQuiz.questions.forEach((question, newIndex) => {
        if (answersMap[question.question] !== undefined) {
            userAnswers[newIndex] = answersMap[question.question];
        }
    });

    // Re-render current question
    renderQuestion();

    console.log('Questions randomized, answers preserved');
}

// Make function globally available for tab monitor
window.randomizeQuestions = randomizeQuestions;

// Listen for randomization events
document.addEventListener('randomizeQuestions', (e) => {
    console.log('Randomization triggered:', e.detail);
    randomizeQuestions();
});

// ========================================
// Initialize on Load
// ========================================

document.addEventListener('DOMContentLoaded', initQuiz);

// Clean up timer on page unload
window.addEventListener('beforeunload', stopTimer);
