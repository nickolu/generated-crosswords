class CrosswordPuzzle {
    constructor(puzzleData) {
        this.puzzle = puzzleData;
        this.selectedCell = null;
        this.selectedClue = null;
        this.userAnswers = {};
        this.startTime = null;
        this.elapsedTime = 0;
        this.timerAnimationId = null;
        this.isRunning = false;
        this.isPaused = false;
        this.isCompleted = false;
        this.showFeedback = false; // Feedback is disabled by default
        this.gameStarted = false; // Track if game has been started
        this.userName = this.getCookie('crossword_user_name') || null;
        this.currentLeaderboardData = null; // Store current leaderboard data for sharing
        this.init();
    }
    
    init() {
        this.setupGrid();
        this.setupTimer();
        this.setupEventListeners();
        this.setupMobileClueNavigator();
        this.blurClues();
        this.showGameOverlay();
    }
    
    // Cookie utility functions
    setCookie(name, value, days = 365) {
        const expires = new Date();
        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
    }
    
    getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for (let i = 0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }
    
    blurClues() {
        const cluesSection = document.querySelector('.clues-section');
        if (cluesSection) {
            cluesSection.classList.add('blurred');
        }
    }
    
    unblurClues() {
        const cluesSection = document.querySelector('.clues-section');
        if (cluesSection) {
            cluesSection.classList.remove('blurred');
        }
    }
    
    showGameOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            // Check if we need to ask for user's name
            if (!this.userName) {
                this.showNamePrompt();
            } else {
                this.showWelcomeOverlay();
            }
            overlay.style.display = 'flex';
        }
    }
    
    showNamePrompt() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                overlayContent.innerHTML = `
                    <h2 class="title">Welcome to<br />Manchat Daily Crossword!</h2>
                    <p>Before we start, what's your name?</p>
                    <div style="margin: 20px 0;">
                        <input type="text" id="userNameInput" placeholder="Enter your name" 
                               style="padding: 10px; font-size: 16px; border: 2px solid #333; border-radius: 5px; margin-bottom: 10px; width: 200px;">
                    </div>
                    <button class="start-game-btn" id="saveNameBtn">Save & Continue</button>
                `;
                
                // Setup event listeners for name input
                const nameInput = document.getElementById('userNameInput');
                const saveBtn = document.getElementById('saveNameBtn');
                
                if (nameInput && saveBtn) {
                    nameInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') {
                            this.saveUserName();
                        }
                    });
                    
                    saveBtn.addEventListener('click', () => this.saveUserName());
                    
                    // Focus the input
                    setTimeout(() => nameInput.focus(), 100);
                }
            }
        }
    }
    
    saveUserName() {
        const nameInput = document.getElementById('userNameInput');
        if (nameInput && nameInput.value.trim()) {
            this.userName = nameInput.value.trim();
            this.setCookie('crossword_user_name', this.userName);
            this.showWelcomeOverlay();
        }
    }
    
    showWelcomeOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                const greeting = this.userName ? `Welcome back, ${this.userName}!` : 'Welcome!';
                overlayContent.innerHTML = `
                    <h2 class="title">Manchat Daily<br />Crossword Classic</h2>
                    <p>${greeting}</p>
                    <p>A classic crossword challenge.</p>
                    <h2>Ready?</h2>
                    <button class="start-game-btn" id="startGameBtn">Start the Game</button>
                `;
                
                // Setup start button event listener
                const startGameBtn = document.getElementById('startGameBtn');
                if (startGameBtn) {
                    startGameBtn.addEventListener('click', () => this.startGame());
                }
            }
        }
    }
    
    hideGameOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            overlay.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                overlay.style.display = 'none';
            }, 300);
        }
    }
    
    showPauseOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            // Update overlay content for pause state
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                overlayContent.innerHTML = `
                    <h2>Game Paused ⏸️</h2>
                    <p>Your progress is saved. Click "Resume" to continue your puzzle.</p>
                    <button class="start-game-btn" id="resumeGameBtn">Resume Game</button>
                `;
                
                // Add event listener to the resume button
                const resumeBtn = overlayContent.querySelector('#resumeGameBtn');
                if (resumeBtn) {
                    resumeBtn.addEventListener('click', () => this.resumeFromPause());
                }
            }
            overlay.style.display = 'flex';
            overlay.style.animation = 'fadeIn 0.3s ease';
        }
    }
    
    resumeFromPause() {
        this.startTimer();
        // Restore focus to the currently selected cell
        if (this.selectedCell !== null) {
            const wrappers = document.querySelectorAll('.cell-wrapper');
            const targetWrapper = wrappers[this.selectedCell];
            const targetInput = targetWrapper?.querySelector('.cell');
            if (targetInput) {
                setTimeout(() => {
                    targetInput.focus();
                }, 100);
            }
        }
    }
    
    startGame() {
        this.gameStarted = true;
        this.hideGameOverlay();
        this.unblurClues();
        this.startTimer();
        this.focusFirstAcrossWord();
    }
    
    focusFirstAcrossWord() {
        // Find the first clue in the 'across' direction
        const acrossClueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'across'
        );
        
        if (acrossClueList && acrossClueList.clues && acrossClueList.clues.length > 0) {
            const firstAcrossClueIndex = acrossClueList.clues[0];
            this.selectClue(firstAcrossClueIndex);
        }
    }
    
    setupGrid() {
        // Set the grid columns dynamically based on puzzle width with responsive sizing
        const grid = document.querySelector('.grid');
        if (grid && this.puzzle.dimensions) {
            // Use CSS custom property for responsive cell sizing
            grid.style.gridTemplateColumns = `repeat(${this.puzzle.dimensions.width}, var(--cell-size, 76px))`;
        }
    }
    
    setupMobileClueNavigator() {
        const prevBtn = document.getElementById('prevClueBtn');
        const nextBtn = document.getElementById('nextClueBtn');
        
        if (prevBtn && nextBtn) {
            prevBtn.addEventListener('click', () => this.navigateToPreviousClue());
            nextBtn.addEventListener('click', () => this.navigateToNextClue());
        }
        
        // Safari iOS initial layout fix
        if (this.isSafariIOS()) {
            this.initializeSafariLayoutFix();
        }
        
        // Initialize with empty state
        this.updateMobileClueDisplay();
    }
    
    // Detect Safari iOS
    isSafariIOS() {
        return /iPad|iPhone|iPod/.test(navigator.userAgent) && 
               /Safari/.test(navigator.userAgent) && 
               !/Chrome/.test(navigator.userAgent) &&
               !/Edge/.test(navigator.userAgent);
    }
    
    // Initialize Safari iOS layout fix on page load
    initializeSafariLayoutFix() {
        const mobileNavigator = document.getElementById('mobileClueNavigator');
        const clueDisplay = mobileNavigator?.querySelector('.clue-display');
        
        if (clueDisplay) {
            // Set initial dimensions for Safari iOS
            clueDisplay.style.minWidth = '280px';
            clueDisplay.style.width = '100%';
            clueDisplay.style.maxWidth = '100%';
            clueDisplay.style.boxSizing = 'border-box';
        }
    }
    
    setupTimer() {
        const pauseBtn = document.getElementById('pauseBtn');
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        const feedbackToggle = document.getElementById('feedbackToggle');
        const leaderboardBtn = document.getElementById('leaderboardBtn');
        
        pauseBtn.addEventListener('click', () => this.pauseTimer());
        
        if (persistentShareBtn) {
            persistentShareBtn.addEventListener('click', () => this.shareScore());
        }
        
        if (feedbackToggle) {
            feedbackToggle.addEventListener('change', (e) => this.toggleFeedback(e.target.checked));
        }
        
        if (leaderboardBtn) {
            leaderboardBtn.addEventListener('click', () => this.showLeaderboard());
        }
        
        // Setup leaderboard modal close functionality
        const closeLeaderboardBtn = document.getElementById('closeLeaderboardBtn');
        const leaderboardModal = document.getElementById('leaderboardModal');
        const leaderboardShareBtn = document.getElementById('leaderboardShareBtn');
        const shareLeaderboardBtn = document.getElementById('shareLeaderboardBtn');
        
        if (closeLeaderboardBtn) {
            closeLeaderboardBtn.addEventListener('click', () => this.hideLeaderboard());
        }
        
        if (leaderboardModal) {
            leaderboardModal.addEventListener('click', (e) => {
                if (e.target === leaderboardModal) {
                    this.hideLeaderboard();
                }
            });
        }
        
        if (leaderboardShareBtn) {
            leaderboardShareBtn.addEventListener('click', () => this.shareScore());
        }
        
        if (shareLeaderboardBtn) {
            shareLeaderboardBtn.addEventListener('click', () => this.shareLeaderboard());
        }

        // Auto-pause when browser tab loses focus
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning && !this.isPaused && this.gameStarted) {
                this.pauseTimer();
            }
        });
    }
    
    startTimer() {
        if (!this.isRunning) {
            this.startTime = Date.now() - this.elapsedTime;
            this.isRunning = true;
            this.isPaused = false;
        } else if (this.isPaused) {
            this.startTime = Date.now() - this.elapsedTime;
            this.isPaused = false;
        }
        
        // Remove blur from clues when starting and hide any overlays
        this.unblurClues();
        this.hideGameOverlay();
        
        this.startTimerAnimation();
        
        document.getElementById('pauseBtn').disabled = false;
    }
    
    startTimerAnimation() {
        if (this.timerAnimationId) {
            cancelAnimationFrame(this.timerAnimationId);
        }
        
        let lastSeconds = -1;
        
        const animate = () => {
            if (!this.isPaused && this.isRunning) {
                this.elapsedTime = Date.now() - this.startTime;
                
                // Only update display when seconds change to avoid unnecessary DOM updates
                const currentSeconds = Math.floor(this.elapsedTime / 1000);
                if (currentSeconds !== lastSeconds) {
                    this.updateTimerDisplay();
                    lastSeconds = currentSeconds;
                }
                
                this.timerAnimationId = requestAnimationFrame(animate);
            }
        };
        
        this.timerAnimationId = requestAnimationFrame(animate);
    }
    
    pauseTimer() {
        if (this.timerAnimationId) {
            cancelAnimationFrame(this.timerAnimationId);
            this.timerAnimationId = null;
        }
        this.isPaused = true;
        
        // Show overlay and blur clues when paused
        this.showPauseOverlay();
        this.blurClues();
        
        document.getElementById('pauseBtn').disabled = true;
    }
    
    updateTimerDisplay() {
        const minutes = Math.floor(this.elapsedTime / 60000);
        const seconds = Math.floor((this.elapsedTime % 60000) / 1000);
        const display = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        document.getElementById('timer').textContent = display;
    }
    
    formatTime(milliseconds) {
        const minutes = Math.floor(milliseconds / 60000);
        const seconds = Math.floor((milliseconds % 60000) / 1000);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
    }
    
    toggleFeedback(enabled) {
        this.showFeedback = enabled;
        // Update all existing cells to show/hide feedback
        this.updateAllCellsFeedback();
    }
    
    updateAllCellsFeedback() {
        const cells = document.querySelectorAll('.cell');
        cells.forEach((cellElement, index) => {
            const cell = this.puzzle.cells[index];
            const userAnswer = this.userAnswers[index];
            
            if (cell && userAnswer) {
                if (this.showFeedback) {
                    // Show feedback colors - use background property to override CSS gradients
                    if (cell.answer === userAnswer) {
                        cellElement.style.setProperty('background', '#c8e6c9', 'important');
                    } else {
                        cellElement.style.setProperty('background', '#ffcdd2', 'important');
                    }
                } else {
                    // Remove feedback colors
                    cellElement.style.removeProperty('background');
                }
            }
        });
    }
    
    setupEventListeners() {
        document.addEventListener('keydown', (e) => {
            this.handleKeyDown(e);
        });
        
        // Setup cell event listeners
        document.querySelectorAll('.cell-wrapper').forEach((wrapper) => {
            const cellIndex = parseInt(wrapper.dataset.index);
            const input = wrapper.querySelector('.cell');
            if (input) {
                wrapper.addEventListener('click', () => this.handleCellClick(cellIndex));
                // Add input cleanup for paste/edge cases (but don't handle normal typing)
                input.addEventListener('input', (e) => this.cleanupInput(e, cellIndex));
            }
        });
        
        // Setup clue event listeners
        document.querySelectorAll('.clue-item').forEach(item => {
            const clueIndex = parseInt(item.dataset.clueIndex);
            item.addEventListener('click', () => this.selectClue(clueIndex));
        });
    }
    
    getClueDirection(clueIndex) {
        // Find which direction list contains this clue
        for (const clueList of this.puzzle.clueLists) {
            if (clueList.clues.includes(clueIndex)) {
                return clueList.name.toLowerCase(); // "across" or "down"
            }
        }
        return null;
    }
    
    selectCell(index, forceToggle = false) {
        const wrappers = document.querySelectorAll('.cell-wrapper');
        const clueItems = document.querySelectorAll('.clue-item');
        const cell = this.puzzle.cells[index];
        
        if (!cell || !cell.clues || cell.clues.length === 0) {
            return; // Invalid cell
        }
        
        let targetClueIndex = null;
        
        if (forceToggle && this.selectedClue !== null && cell.clues.includes(this.selectedClue) && cell.clues.length > 1) {
            // Explicit toggle request - switch to the other clue
            targetClueIndex = cell.clues.find(clueIndex => clueIndex !== this.selectedClue);
        } else if (this.selectedClue !== null && cell.clues.includes(this.selectedClue)) {
            // Cell is part of current word - keep the same word selected
            targetClueIndex = this.selectedClue;
        } else {
            // New cell - try to maintain direction, or use first clue
            if (this.selectedClue !== null) {
                const currentDirection = this.getClueDirection(this.selectedClue);
                // Look for a clue in the same direction
                targetClueIndex = cell.clues.find(clueIndex => 
                    this.getClueDirection(clueIndex) === currentDirection
                ) || cell.clues[0];
            } else {
                // No previous selection
                targetClueIndex = cell.clues[0];
            }
        }
        
        // Clear previous selections
        wrappers.forEach(wrapper => {
            wrapper.classList.remove('selected', 'highlighted', 'empty');
        });
        clueItems.forEach(item => item.classList.remove('selected'));
        
        // Set new selection
        this.selectedCell = index;
        this.selectedClue = targetClueIndex;
        
        // Find the target wrapper using data-index attribute
        const targetWrapper = document.querySelector(`.cell-wrapper[data-index="${index}"]`);
        const targetInput = targetWrapper?.querySelector('.cell');
        if (targetWrapper && targetInput) {
            targetWrapper.classList.add('selected');
            this.updateCellEmptyState(targetWrapper, index);
            
            // On mobile, prevent default scroll behavior and apply our own
            if (window.innerWidth <= 640) {
                // Focus without scrolling, but don't select text to prevent highlighting
                targetInput.focus({ preventScroll: true });
                
                // Apply our custom scroll after a brief delay
                setTimeout(() => {
                    this.scrollToPuzzleOnMobile();
                }, 10);
            } else {
                targetInput.focus();
                targetInput.select();
            }
        }
        
        // Highlight the word and clue
        if (targetClueIndex !== null) {
            this.highlightWord(targetClueIndex);
            const clueItem = document.querySelector(`[data-clue-index="${targetClueIndex}"]`);
            if (clueItem) {
                clueItem.classList.add('selected');
            }
        }
        
        // Start timer on first interaction (only if game has been started)
        if (this.gameStarted && !this.isRunning && !this.isPaused) {
            this.startTimer();
        }
        
        // Update mobile clue navigator
        this.updateMobileClueDisplay();
    }
    
    handleCellClick(index) {
        const cell = this.puzzle.cells[index];
        
        // Check if this is a click on the same cell that's already selected
        // and the cell has multiple clues (crossing words)
        if (this.selectedCell === index && 
            this.selectedClue !== null && 
            cell && cell.clues && 
            cell.clues.includes(this.selectedClue) && 
            cell.clues.length > 1) {
            // Toggle to the crossing word
            this.selectCell(index, true);
        } else {
            // Normal selection
            this.selectCell(index, false);
        }
    }
    
    selectClue(clueIndex) {
        const clueItems = document.querySelectorAll('.clue-item');
        clueItems.forEach(item => item.classList.remove('selected'));
        
        const wrappers = document.querySelectorAll('.cell-wrapper');
        wrappers.forEach(wrapper => {
            wrapper.classList.remove('selected', 'highlighted', 'empty');
        });
        
        this.selectedClue = clueIndex;
        
        const clueItem = document.querySelector(`[data-clue-index="${clueIndex}"]`);
        if (clueItem) {
            clueItem.classList.add('selected');
        }
        
        this.highlightWord(clueIndex);
        
        // Focus on first unfilled cell of the word, or first cell if all filled
        const clue = this.puzzle.clues[clueIndex];
        let targetCellIndex = clue.cells[0]; // default to first cell
        
        // Find first unfilled cell
        for (const cellIndex of clue.cells) {
            if (!this.userAnswers[cellIndex]) {
                targetCellIndex = cellIndex;
                break;
            }
        }
        
        // Find the target wrapper using data-index attribute
        const targetWrapper = document.querySelector(`.cell-wrapper[data-index="${targetCellIndex}"]`);
        const targetInput = targetWrapper?.querySelector('.cell');
        if (targetWrapper && targetInput) {
            this.selectedCell = targetCellIndex;
            targetWrapper.classList.add('selected');
            this.updateCellEmptyState(targetWrapper, targetCellIndex);
            
            // On mobile, prevent default scroll behavior and apply our own
            if (window.innerWidth <= 640) {
                // Focus without scrolling, but don't select text to prevent highlighting
                targetInput.focus({ preventScroll: true });
                
                // Apply our custom scroll after a brief delay
                setTimeout(() => {
                    this.scrollToPuzzleOnMobile();
                }, 10);
            } else {
                targetInput.focus();
                targetInput.select();
            }
        }
        
        // Start timer on first interaction (only if game has been started)
        if (this.gameStarted && !this.isRunning && !this.isPaused) {
            this.startTimer();
        }
        
        // Update mobile clue navigator
        this.updateMobileClueDisplay();
    }
    
    highlightWord(clueIndex) {
        const clue = this.puzzle.clues[clueIndex];
        
        clue.cells.forEach(cellIndex => {
            // Only highlight valid, non-black cells that are part of this clue
            const cell = this.puzzle.cells[cellIndex];
            if (cell && Object.keys(cell).length > 0) {
                // Find the wrapper element using data-index attribute
                const wrapper = document.querySelector(`.cell-wrapper[data-index="${cellIndex}"]`);
                if (wrapper) {
                    wrapper.classList.add('highlighted');
                }
            }
        });
    }
    

    
    cleanupInput(event, cellIndex) {
        // Simple cleanup for paste/edge cases - only ensures valid single letter
        const value = event.target.value.toUpperCase();
        const firstValidChar = value.match(/[A-Z]/)?.[0] || '';
        
        if (firstValidChar && firstValidChar !== value) {
            // Input has invalid characters or multiple characters, clean it
            event.target.value = firstValidChar;
            this.userAnswers[cellIndex] = firstValidChar;
        } else if (!firstValidChar && value) {
            // Input has no valid characters but has content, clear it
            event.target.value = '';
            delete this.userAnswers[cellIndex];
        }
        
        // Update visual state to match
        const wrapper = event.target.closest('.cell-wrapper');
        if (wrapper) this.updateCellEmptyState(wrapper, cellIndex);
    }
    
    updateCellEmptyState(wrapperElement, cellIndex) {
        // Add or remove 'empty' class and cursor element based on whether the cell has content
        const hasContent = this.userAnswers[cellIndex] && this.userAnswers[cellIndex].length > 0;
        
        if (hasContent) {
            wrapperElement.classList.remove('empty');
        } else {
            wrapperElement.classList.add('empty');
        }
    }
    
    checkPuzzleCompletion() {
        let allCorrect = true;
        let allFilled = true;
        
        this.puzzle.cells.forEach((cell, index) => {
            if (cell && Object.keys(cell).length > 0) {
                const userAnswer = this.userAnswers[index];
                if (!userAnswer) {
                    allFilled = false;
                } else if (userAnswer !== cell.answer) {
                    allCorrect = false;
                }
            }
        });
        
        if (allFilled && allCorrect) {
            this.onPuzzleComplete();
        }
    }
    
    onPuzzleComplete() {
        // Stop the timer
        if (this.timerAnimationId) {
            cancelAnimationFrame(this.timerAnimationId);
            this.timerAnimationId = null;
        }
        this.isRunning = false;
        this.isPaused = true;
        this.isCompleted = true;
        
        document.getElementById('pauseBtn').disabled = true;
        
        // Enable the persistent share button
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        if (persistentShareBtn) {
            persistentShareBtn.disabled = false;
        }
        
        // Show initial completion feedback immediately
        this.showCompletionLeaderboard();
        
        // Send results to server, then refresh leaderboard data
        this.sendResultsToServer()
            .then(() => {
                // Update header to show submission success
                this.loadLeaderboardData(this.puzzle.date);
            })
            .catch(() => {
                // Update header to show submission failed but continue
                const modal = document.getElementById('leaderboardModal');
                const leaderboardHeader = modal?.querySelector('.leaderboard-header h2');
                if (leaderboardHeader) {
                    leaderboardHeader.innerHTML = '🎉 Puzzle Complete! 🎉<br/><span style="font-size: 0.8em; font-weight: normal;">Showing current leaderboard...</span>';
                }
                console.log('Results submission failed, but leaderboard is already displayed');
            });
    }
    
    sendResultsToServer() {
        // Only send if we have a username and valid completion time
        if (!this.userName || !this.elapsedTime || this.elapsedTime === 0) {
            console.log('Skipping results submission: missing username or completion time');
            return Promise.resolve(); // Return resolved promise for consistency
        }
        
        // Convert milliseconds to integer seconds
        const timeInSeconds = Math.floor(this.elapsedTime / 1000);
        
        // Construct the URL
        const url = `results?user=${encodeURIComponent(this.userName)}&time=${timeInSeconds}&date=${this.puzzle.date}`;
        
        // Send GET request and return the promise
        return fetch(url, {
            method: 'GET',
            mode: 'no-cors' // Use no-cors to allow cross-origin request
        }).then(response => {
            // With no-cors mode, we can't check response status, so assume success
            console.log(`Results sent successfully: ${this.userName} completed in ${timeInSeconds} seconds`);
            return response;
        }).catch(error => {
            console.warn('Failed to send results to server:', error);
            // Don't show error to user, just log it
            throw error; // Re-throw so caller can handle
        });
    }
    
    shareScore() {
        const puzzleTitle = document.querySelector('.title').textContent;
        const completionTime = this.formatTime(this.elapsedTime);
        
        // Check if puzzle is actually completed
        if (!this.elapsedTime || this.elapsedTime === 0) {
            this.showPersistentShareFeedback('Complete the puzzle first!');
            return;
        }
        
        const userNameText = this.userName ? `👤 ${this.userName}\n` : '';
        const shareText = `🧩 ${puzzleTitle} completed!\n${userNameText}⏱️ Time: ${completionTime}\n\n🔗 Play today's crossword: https://manchat.men/mini`;
        
        // Try to use the modern Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(shareText).then(() => {
                this.showPersistentShareFeedback('Score copied to clipboard!');
            }).catch(() => {
                this.fallbackCopyToClipboard(shareText);
            });
        } else {
            // Fallback for older browsers or non-HTTPS contexts
            this.fallbackCopyToClipboard(shareText);
        }
    }
    
    fallbackCopyToClipboard(text, isLeaderboard = false) {
        // Create a temporary textarea element
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
            document.execCommand('copy');
            if (isLeaderboard) {
                this.showShareLeaderboardFeedback('Leaderboard copied to clipboard!');
            } else {
                this.showPersistentShareFeedback('Score copied to clipboard!');
            }
        } catch {
            if (isLeaderboard) {
                this.showShareLeaderboardFeedback('Unable to copy to clipboard');
            } else {
                this.showPersistentShareFeedback('Unable to copy to clipboard');
            }
        }
        
        document.body.removeChild(textArea);
    }
    
    showCopyFeedback(message) {
        const shareBtn = document.getElementById('shareBtn');
        const originalText = shareBtn.textContent;
        shareBtn.textContent = message;
        shareBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
        
        setTimeout(() => {
            shareBtn.textContent = originalText;
            shareBtn.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
        }, 2000);
    }
    
    shareLeaderboard() {
        const puzzleTitle = document.querySelector('.title').textContent;
        
        // Get current leaderboard data
        const leaderboardData = this.currentLeaderboardData;
        if (!leaderboardData || Object.keys(leaderboardData).length === 0) {
            this.showShareLeaderboardFeedback('No leaderboard data available');
            return;
        }
        
        // Convert to sorted array
        const entries = Object.entries(leaderboardData)
            .map(([name, timeInSeconds]) => ({
                name,
                timeInSeconds: parseInt(timeInSeconds),
                timeFormatted: this.formatTimeFromSeconds(timeInSeconds)
            }))
            .sort((a, b) => a.timeInSeconds - b.timeInSeconds);
        
        // Build the share text
        let shareText = `🏆 ${puzzleTitle} Leaderboard\n\n`;
        
        entries.forEach((entry, index) => {
            const rank = index + 1;
            let rankEmoji = `${rank}.`;
            
            if (rank === 1) rankEmoji = '🥇';
            else if (rank === 2) rankEmoji = '🥈';
            else if (rank === 3) rankEmoji = '🥉';
            else if (rank === 4) rankEmoji = '🦥';
            else if (rank === 5) rankEmoji = '🐌';
            else rankEmoji = '🐢';
            
            shareText += `${rankEmoji} ${entry.name} - ${entry.timeFormatted}\n`;
        });
        
        shareText += `\n🔗 Play today's crossword: https://manchat.men/mini`;
        
        // Copy to clipboard
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(shareText).then(() => {
                this.showShareLeaderboardFeedback('Leaderboard copied to clipboard!');
            }).catch(() => {
                this.fallbackCopyToClipboard(shareText, true);
            });
        } else {
            this.fallbackCopyToClipboard(shareText, true);
        }
    }
    
    showPersistentShareFeedback(message) {
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        const leaderboardShareBtn = document.getElementById('leaderboardShareBtn');
        
        // Update persistent share button if it exists
        if (persistentShareBtn) {
            const originalText = persistentShareBtn.textContent;
            persistentShareBtn.textContent = message;
            
            setTimeout(() => {
                persistentShareBtn.textContent = originalText;
            }, 2000);
        }
        
        // Update leaderboard share button if it exists
        if (leaderboardShareBtn) {
            const originalText = leaderboardShareBtn.textContent;
            leaderboardShareBtn.textContent = message;
            
            setTimeout(() => {
                leaderboardShareBtn.textContent = originalText;
            }, 2000);
        }
    }
    
    showShareLeaderboardFeedback(message) {
        const shareLeaderboardBtn = document.getElementById('shareLeaderboardBtn');
        
        if (shareLeaderboardBtn) {
            const originalText = shareLeaderboardBtn.textContent;
            shareLeaderboardBtn.textContent = message;
            
            setTimeout(() => {
                shareLeaderboardBtn.textContent = originalText;
            }, 2000);
        }
    }
    
    moveToNextCell(currentIndex) {
        if (this.selectedClue !== null) {
            const clue = this.puzzle.clues[this.selectedClue];
            const currentPosition = clue.cells.indexOf(currentIndex);
            
            if (currentPosition >= 0 && currentPosition < clue.cells.length - 1) {
                // Look for the next empty cell in the current word
                let nextEmptyCellIndex = null;
                
                for (let i = currentPosition + 1; i < clue.cells.length; i++) {
                    const cellIndex = clue.cells[i];
                    if (!this.userAnswers[cellIndex]) {
                        nextEmptyCellIndex = cellIndex;
                        break;
                    }
                }
                
                if (nextEmptyCellIndex !== null) {
                    // Found an empty cell, move to it
                    this.moveToCell(nextEmptyCellIndex);
                } else {
                    // All remaining cells in this word are filled, move to next word
                    this.moveToNextWord();
                }
            } else if (currentPosition === clue.cells.length - 1) {
                // We're at the last cell of the current word, move to next word
                this.moveToNextWord();
            }
        }
    }
    
    moveToCell(index) {
        // Simple cell movement without changing word selection
        const wrappers = document.querySelectorAll('.cell-wrapper');
        
        // Remove selected class from current cell
        wrappers.forEach(wrapper => {
            wrapper.classList.remove('selected', 'empty');
        });
        
        // Set new selected cell
        this.selectedCell = index;
        // Find the target wrapper using data-index attribute
        const targetWrapper = document.querySelector(`.cell-wrapper[data-index="${index}"]`);
        const targetInput = targetWrapper?.querySelector('.cell');
        if (targetWrapper && targetInput) {
            targetWrapper.classList.add('selected');
            this.updateCellEmptyState(targetWrapper, index);
            
            // On mobile, prevent default scroll behavior and apply our own
            if (window.innerWidth <= 640) {
                // Focus without scrolling, but don't select text to prevent highlighting
                targetInput.focus({ preventScroll: true });
                
                // Apply our custom scroll after a brief delay
                setTimeout(() => {
                    this.scrollToPuzzleOnMobile();
                }, 10);
            } else {
                targetInput.focus();
                targetInput.select();
            }
        }
    }
    
    moveToNextWord() {
        if (this.selectedClue === null) return;
        
        const currentDirection = this.getClueDirection(this.selectedClue);
        
        // Check if current word is the last in its direction sequence
        if (this.isLastWordInDirection(this.selectedClue, currentDirection)) {
            // Move to first word of opposite direction
            const oppositeDirection = currentDirection === 'across' ? 'down' : 'across';
            const firstWordClueIndex = this.findFirstWordInDirection(oppositeDirection);
            
            if (firstWordClueIndex !== null) {
                this.selectClue(firstWordClueIndex);
                return;
            }
        }
        
        // Otherwise, find next unfilled word in current direction
        const nextWordClueIndex = this.findNextUnfilledWord(currentDirection);
        
        if (nextWordClueIndex !== null) {
            // Found next unfilled word in current direction
            this.selectClue(nextWordClueIndex);
        } else {
            // No more unfilled words in current direction, switch to opposite direction
            const oppositeDirection = currentDirection === 'across' ? 'down' : 'across';
            const oppositeWordClueIndex = this.findNextUnfilledWord(oppositeDirection);
            
            if (oppositeWordClueIndex !== null) {
                this.selectClue(oppositeWordClueIndex);
            }
        }
    }
    
    findNextUnfilledWord(direction) {
        // Get the clue list for the specified direction
        const clueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === direction.toLowerCase()
        );
        
        if (!clueList) return null;
        
        // Find the current clue index in the direction's clue list
        const currentClueIndex = this.selectedClue;
        const currentPositionInList = clueList.clues.indexOf(currentClueIndex);
        
        // Look for next unfilled word starting from current position + 1
        for (let i = currentPositionInList + 1; i < clueList.clues.length; i++) {
            const clueIndex = clueList.clues[i];
            if (this.isWordUnfilled(clueIndex)) {
                return clueIndex;
            }
        }
        
        // If we didn't find one after current position, look from beginning
        for (let i = 0; i <= currentPositionInList; i++) {
            const clueIndex = clueList.clues[i];
            if (this.isWordUnfilled(clueIndex)) {
                return clueIndex;
            }
        }
        
        return null;
    }
    
    isWordUnfilled(clueIndex) {
        const clue = this.puzzle.clues[clueIndex];
        if (!clue || !clue.cells) return false;
        
        // Check if any cell in the word is empty
        return clue.cells.some(cellIndex => !this.userAnswers[cellIndex]);
    }
    
    isLastWordInDirection(clueIndex, direction) {
        const clueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === direction.toLowerCase()
        );
        
        if (!clueList) return false;
        
        // Check if this clue is the last one in the direction's clue list
        return clueList.clues[clueList.clues.length - 1] === clueIndex;
    }
    
    findFirstWordInDirection(direction) {
        const clueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === direction.toLowerCase()
        );
        
        if (!clueList || clueList.clues.length === 0) return null;
        
        // Return the first clue in the direction
        return clueList.clues[0];
    }
    
    findNextValidCell(startIndex, direction) {
        const { width, height } = this.puzzle.dimensions;
        let currentIndex = startIndex;
        
        // Define step based on direction
        let step;
        switch (direction) {
            case 'ArrowUp':
                step = -width;
                break;
            case 'ArrowDown':
                step = width;
                break;
            case 'ArrowLeft':
                step = -1;
                break;
            case 'ArrowRight':
                step = 1;
                break;
            default:
                return null;
        }
        
        // Search for next valid cell in the given direction
        let attempts = 0;
        const maxAttempts = Math.max(width, height); // Prevent infinite loops
        
        while (attempts < maxAttempts) {
            // Check bounds based on direction
            const currentRow = Math.floor(currentIndex / width);
            const currentCol = currentIndex % width;
            
            if (direction === 'ArrowUp' && currentRow <= 0) break;
            if (direction === 'ArrowDown' && currentRow >= height - 1) break;
            if (direction === 'ArrowLeft' && currentCol <= 0) break;
            if (direction === 'ArrowRight' && currentCol >= width - 1) break;
            
            // Check if we would wrap around rows when moving left/right
            if (direction === 'ArrowLeft' && currentCol === 0) break;
            if (direction === 'ArrowRight' && currentCol === width - 1) break;
            
            const cell = this.puzzle.cells[currentIndex];
            
            // A valid cell has content (not empty object) and has clues
            if (cell && Object.keys(cell).length > 0 && cell.clues && cell.clues.length > 0) {
                return currentIndex;
            }
            
            currentIndex += step;
            attempts++;
        }
        
        return null; // No valid cell found
    }
    
    handleKeyDown(event) {
        if (this.selectedCell === null) return;
        
        const { width, height } = this.puzzle.dimensions;
        const currentRow = Math.floor(this.selectedCell / width);
        const currentCol = this.selectedCell % width;
        
        let nextIndex = null;
        
        // Handle letter input directly in keydown for immediate response
        if (event.key.match(/^[A-Za-z]$/)) {
            const letter = event.key.toUpperCase();
            const currentCell = document.querySelector(`input.cell[data-index="${this.selectedCell}"]`);
            const cell = this.puzzle.cells[this.selectedCell];
            
            if (currentCell && cell) {
                // Set the letter in the cell
                currentCell.value = letter;
                this.userAnswers[this.selectedCell] = letter;
                
                // Update empty state for cursor display
                const wrapper = currentCell.closest('.cell-wrapper');
                if (wrapper) this.updateCellEmptyState(wrapper, this.selectedCell);
                
                // Only show feedback if enabled
                if (this.showFeedback && cell) {
                    if (cell.answer === letter) {
                        currentCell.style.setProperty('background', '#c8e6c9', 'important');
                    } else {
                        currentCell.style.setProperty('background', '#ffcdd2', 'important');
                    }
                } else {
                    currentCell.style.removeProperty('background');
                }
                
                // Check for puzzle completion
                this.checkPuzzleCompletion();
                
                // Only move to next cell if puzzle is not completed
                if (this.isRunning) {  // Timer is stopped when puzzle completes
                    this.moveToNextCell(this.selectedCell);
                }
            }
            event.preventDefault();
            return;
        }
        
        switch (event.key) {
            case 'Tab':
                // Move to next word in current direction, or switch direction if at end
                this.moveToNextWord();
                event.preventDefault();
                break;
            case 'ArrowUp':
                if (currentRow > 0) {
                    nextIndex = this.selectedCell - width;
                }
                break;
            case 'ArrowDown':
                if (currentRow < height - 1) {
                    nextIndex = this.selectedCell + width;
                }
                break;
            case 'ArrowLeft':
                if (currentCol > 0) {
                    nextIndex = this.selectedCell - 1;
                }
                break;
            case 'ArrowRight':
                if (currentCol < width - 1) {
                    nextIndex = this.selectedCell + 1;
                }
                break;
            case 'Backspace':
                if (this.selectedClue !== null) {
                    const currentCell = document.querySelector(`input.cell[data-index="${this.selectedCell}"]`);
                    
                    // Check if current cell has content
                    if (currentCell && currentCell.value) {
                        // Delete current cell content
                        currentCell.value = '';
                        delete this.userAnswers[this.selectedCell];
                        currentCell.style.removeProperty('background');
                        
                        // Update empty state for cursor display
                        const wrapper = currentCell.closest('.cell-wrapper');
                        if (wrapper) this.updateCellEmptyState(wrapper, this.selectedCell);
                    } else {
                        // Current cell is empty, move to previous cell and delete its content
                        const clue = this.puzzle.clues[this.selectedClue];
                        const currentPosition = clue.cells.indexOf(this.selectedCell);
                        if (currentPosition > 0) {
                            const prevCellIndex = clue.cells[currentPosition - 1];
                            // Move to previous cell
                            this.moveToCell(prevCellIndex);
                            // Immediately delete the letter in the previous cell
                            const prevCell = document.querySelector(`input.cell[data-index="${prevCellIndex}"]`);
                            if (prevCell) {
                                prevCell.value = '';
                                delete this.userAnswers[prevCellIndex];
                                prevCell.style.removeProperty('background');
                                
                                // Update empty state for cursor display
                                const wrapper = prevCell.closest('.cell-wrapper');
                                if (wrapper) this.updateCellEmptyState(wrapper, prevCellIndex);
                            }
                        }
                    }
                }
                event.preventDefault();
                break;
        }
        
        if (nextIndex !== null) {
            // Find the next valid cell (skip black squares)
            const validIndex = this.findNextValidCell(nextIndex, event.key);
            if (validIndex !== null) {
                this.selectCell(validIndex);
            }
            event.preventDefault();
        }
    }
    
    // Leaderboard functionality
    showLeaderboard() {
        const modal = document.getElementById('leaderboardModal');
        if (modal) {
            modal.style.display = 'flex';
            this.loadLeaderboardData();
            this.updateShareButtonVisibility();
        }
    }
    
    showCompletionLeaderboard() {
        const modal = document.getElementById('leaderboardModal');
        if (modal) {
            // Show completion celebration header
            const leaderboardHeader = modal.querySelector('.leaderboard-header h2');
            if (leaderboardHeader) {
                leaderboardHeader.innerHTML = '🎉 Puzzle Complete! 🎉';
            }
            
            modal.style.display = 'flex';
            this.updateShareButtonVisibility();
            
            // Reset header after 3 seconds
            setTimeout(() => {
                if (leaderboardHeader) {
                    leaderboardHeader.innerHTML = '🏆 Today\'s Leaderboard';
                }
            }, 3000);
        }
    }
    
    hideLeaderboard() {
        const modal = document.getElementById('leaderboardModal');
        if (modal) {
            modal.style.animation = 'fadeOut 0.3s ease';
            setTimeout(() => {
                modal.style.display = 'none';
                modal.style.animation = '';
            }, 300);
        }
    }
    
    async loadLeaderboardData() {
        const leaderboardBody = document.getElementById('leaderboardBody');
        if (!leaderboardBody) return;
        
        // Show loading state
        leaderboardBody.innerHTML = '<div class="loading">Loading today\'s leaderboard...</div>';
        
        try {
            const dataUrl = `data/${this.puzzle.date}.json`;
            
            const response = await fetch(dataUrl, {
                method: 'GET',
                mode: 'cors',
                cache: 'no-cache',
                headers: {
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0'
                }
            });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            
            const data = await response.json();
            this.displayLeaderboardData(data);
            
        } catch (error) {
            console.warn('Failed to load leaderboard data:', error);
            this.displayLeaderboardError();
        }
    }
    
    displayLeaderboardData(data) {
        const leaderboardBody = document.getElementById('leaderboardBody');
        if (!leaderboardBody) return;
        
        // Store the leaderboard data for sharing
        this.currentLeaderboardData = data;
        
        if (!data || Object.keys(data).length === 0) {
            leaderboardBody.innerHTML = '<div class="empty-leaderboard">No times recorded yet today.<br/>Be the first to complete the puzzle!</div>';
            return;
        }
        
        // Convert object to array and sort by time (ascending)
        const entries = Object.entries(data)
            .map(([name, timeInSeconds]) => ({
                name,
                timeInSeconds: parseInt(timeInSeconds),
                timeFormatted: this.formatTimeFromSeconds(timeInSeconds)
            }))
            .sort((a, b) => a.timeInSeconds - b.timeInSeconds);
        
        // Generate leaderboard HTML
        let html = '<ul class="leaderboard-list">';
        entries.forEach((entry, index) => {
            const rank = index + 1;
            const isTopThree = rank <= 3;
            const isCurrentUser = this.userName && entry.name === this.userName;
            
            let rankDisplay = rank;
            if (rank === 1) rankDisplay = '🥇';
            else if (rank === 2) rankDisplay = '🥈';
            else if (rank === 3) rankDisplay = '🥉';
            
            const itemClasses = [];
            if (isTopThree) itemClasses.push('top-3');
            if (isCurrentUser) itemClasses.push('user-entry');
            
            html += `
                <li class="leaderboard-item ${itemClasses.join(' ')}">
                    <span class="leaderboard-rank">${rankDisplay}</span>
                    <span class="leaderboard-name">${this.escapeHtml(entry.name)}</span>
                    <span class="leaderboard-time">${entry.timeFormatted}</span>
                </li>
            `;
        });
        html += '</ul>';
        
        leaderboardBody.innerHTML = html;
    }
    
    displayLeaderboardError() {
        const leaderboardBody = document.getElementById('leaderboardBody');
        if (!leaderboardBody) return;
        
        leaderboardBody.innerHTML = `
            <div class="error-message">
                ⚠️ Unable to load today's leaderboard.<br/>
                Please check your connection and try again.
            </div>
        `;
    }
    
    formatTimeFromSeconds(seconds) {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
    }
    
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    updateShareButtonVisibility() {        
        const shareSection = document.getElementById('leaderboardShareSection');
        if (shareSection) {
            // Show share section only if puzzle is completed
            shareSection.style.display = this.isCompleted ? 'block' : 'none';
        }

        const completionTimeSection = shareSection.querySelector('.completion-time');
        if (completionTimeSection) {
            completionTimeSection.style.display = this.isCompleted ? 'block' : 'none';
        }

        if (this.isCompleted) {
            // Update the completion time display in the modal
            const completionTimeElement = document.getElementById('leaderboardCompletionTime');
            if (completionTimeElement) {
                completionTimeElement.textContent = this.formatTime(this.elapsedTime);
            }
        }
    }
    
    // Mobile scroll optimization
    scrollToPuzzleOnMobile() {
        // Only scroll on mobile devices
        if (window.innerWidth <= 640) {
            const crosswordGrid = document.querySelector('.crossword-grid');
            if (crosswordGrid) {
                // Use multiple timeouts to override browser scroll behavior
                const scrollToPuzzleTop = () => {
                    crosswordGrid.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start', // Align to top
                        inline: 'nearest'
                    });
                };
                
                // Immediate scroll
                scrollToPuzzleTop();
                
                // Override any browser auto-scroll after focus
                setTimeout(scrollToPuzzleTop, 50);
                setTimeout(scrollToPuzzleTop, 150);
                setTimeout(scrollToPuzzleTop, 300);
            }
        }
    }
    
    // Mobile Clue Navigator Methods
    updateMobileClueDisplay() {
        const clueNumberEl = document.getElementById('mobileClueNumber');
        const clueDirectionEl = document.getElementById('mobileClueDirection');
        const clueTextEl = document.getElementById('mobileClueText');
        const prevBtn = document.getElementById('prevClueBtn');
        const nextBtn = document.getElementById('nextClueBtn');
        
        if (!clueNumberEl || !clueDirectionEl || !clueTextEl || !prevBtn || !nextBtn) {
            return;
        }
        
        // Safari iOS layout fix: Store current dimensions before updating text
        const mobileNavigator = document.getElementById('mobileClueNavigator');
        const clueDisplay = mobileNavigator?.querySelector('.clue-display');
        let originalWidth = null;
        
        if (this.isSafariIOS() && clueDisplay) {
            originalWidth = clueDisplay.getBoundingClientRect().width;
        }
        
        if (this.selectedClue === null) {
            clueNumberEl.textContent = '';
            clueDirectionEl.textContent = '';
            clueTextEl.textContent = 'Select a clue to begin';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            this.forceSafariLayoutFix(clueDisplay, originalWidth);
            return;
        }
        
        const clue = this.puzzle.clues[this.selectedClue];
        const direction = this.getClueDirection(this.selectedClue);
        
        if (clue && direction) {
            clueNumberEl.textContent = clue.label;
            clueDirectionEl.textContent = direction.charAt(0).toUpperCase() + direction.slice(1);
            clueTextEl.textContent = clue.text[0].plain;
            
            // Update button states
            const { hasPrev, hasNext } = this.getNavigationState();
            prevBtn.disabled = !hasPrev;
            nextBtn.disabled = !hasNext;
            
            // Safari iOS layout fix: Force width after text update
            this.forceSafariLayoutFix(clueDisplay, originalWidth);
        }
    }
    
    // Force Safari iOS to maintain proper width
    forceSafariLayoutFix(clueDisplay, originalWidth) {
        if (!this.isSafariIOS() || !clueDisplay) return;
        
        requestAnimationFrame(() => {
            // Force minimum width for Safari iOS
            const minWidth = Math.max(originalWidth || 200, 200);
            clueDisplay.style.minWidth = `${minWidth}px`;
            clueDisplay.style.width = '100%';
            clueDisplay.style.maxWidth = '100%';
            clueDisplay.style.boxSizing = 'border-box';
            
            // Force layout recalculation
            const computed = window.getComputedStyle(clueDisplay);
            // Trigger reflow by accessing computed styles
            void computed.width;
            
            // Additional safety check after a short delay
            setTimeout(() => {
                const currentWidth = clueDisplay.getBoundingClientRect().width;
                if (currentWidth < 180) {
                    clueDisplay.style.minWidth = '280px';
                    clueDisplay.style.width = '100%';
                }
            }, 50);
        });
    }
    
    getNavigationState() {
        if (this.selectedClue === null) {
            return { hasPrev: false, hasNext: false };
        }
        
        const currentDirection = this.getClueDirection(this.selectedClue);
        const currentClueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === currentDirection.toLowerCase()
        );
        
        if (!currentClueList) {
            return { hasPrev: false, hasNext: false };
        }
        
        const currentIndex = currentClueList.clues.indexOf(this.selectedClue);
        const isFirstInDirection = currentIndex === 0;
        const isLastInDirection = currentIndex === currentClueList.clues.length - 1;
        
        // Check if there are clues in the opposite direction
        const oppositeDirection = currentDirection === 'across' ? 'down' : 'across';
        const oppositeClueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === oppositeDirection.toLowerCase()
        );
        
        const hasOppositeDirection = oppositeClueList && oppositeClueList.clues.length > 0;
        
        const hasPrev = !isFirstInDirection || hasOppositeDirection;
        const hasNext = !isLastInDirection || hasOppositeDirection;
        
        return { hasPrev, hasNext };
    }
    
    navigateToPreviousClue() {
        if (this.selectedClue === null) return;
        
        const currentDirection = this.getClueDirection(this.selectedClue);
        const currentClueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === currentDirection.toLowerCase()
        );
        
        if (!currentClueList) return;
        
        const currentIndex = currentClueList.clues.indexOf(this.selectedClue);
        
        if (currentIndex > 0) {
            // Move to previous clue in same direction
            const prevClueIndex = currentClueList.clues[currentIndex - 1];
            this.selectClue(prevClueIndex);
        } else {
            // Move to last clue in opposite direction
            const oppositeDirection = currentDirection === 'across' ? 'down' : 'across';
            const oppositeClueList = this.puzzle.clueLists.find(list => 
                list.name.toLowerCase() === oppositeDirection.toLowerCase()
            );
            
            if (oppositeClueList && oppositeClueList.clues.length > 0) {
                const lastClueIndex = oppositeClueList.clues[oppositeClueList.clues.length - 1];
                this.selectClue(lastClueIndex);
            }
        }
    }
    
    navigateToNextClue() {
        if (this.selectedClue === null) return;
        
        const currentDirection = this.getClueDirection(this.selectedClue);
        const currentClueList = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === currentDirection.toLowerCase()
        );
        
        if (!currentClueList) return;
        
        const currentIndex = currentClueList.clues.indexOf(this.selectedClue);
        
        if (currentIndex < currentClueList.clues.length - 1) {
            // Move to next clue in same direction
            const nextClueIndex = currentClueList.clues[currentIndex + 1];
            this.selectClue(nextClueIndex);
        } else {
            // Move to first clue in opposite direction
            const oppositeDirection = currentDirection === 'across' ? 'down' : 'across';
            const oppositeClueList = this.puzzle.clueLists.find(list => 
                list.name.toLowerCase() === oppositeDirection.toLowerCase()
            );
            
            if (oppositeClueList && oppositeClueList.clues.length > 0) {
                const firstClueIndex = oppositeClueList.clues[0];
                this.selectClue(firstClueIndex);
            }
        }
    }
}

/**
 * CrosswordLoader - Handles loading and displaying crossword puzzles with configurable year offset.
 * 
 * The yearOffset parameter controls the delay between puzzle publication and display dates.
 * For example, with yearOffset=11, a puzzle published on 2014-08-29 will be displayed
 * and have its scores/leaderboard tracked as 2025-08-29.
 */
class CrosswordLoader {
    constructor(yearOffset = 11) {
        this.puzzle = null;
        this.crosswordInstance = null;
        this.yearOffset = yearOffset; // Number of years to add to publication date for display
    }

    /**
     * Extract date from filename (supports both mini_YYYY-MM-DD.json and YYYY-MM-DD.json formats)
     * @param {string} filePath - Path to the puzzle file
     * @returns {string|null} - Date string in YYYY-MM-DD format, or null if not found
     */
    extractDateFromPath(filePath) {
        const dateMatch = filePath.match(/(\d{4}-\d{2}-\d{2})/);
        return dateMatch ? dateMatch[1] : null;
    }

    /**
     * Calculate the display date by adding the yearOffset to the publication date
     * @param {string} publicationDate - Date string in YYYY-MM-DD format
     * @returns {string} - Display date string in YYYY-MM-DD format
     */
    calculateDisplayDate(publicationDate) {
        const pubDate = new Date(publicationDate);
        const displayDate = new Date(pubDate.setFullYear(pubDate.getFullYear() + this.yearOffset));
        return displayDate.toISOString().split('T')[0];
    }

    /**
     * Calculate today's date minus yearOffset to determine which puzzle should be shown
     * @returns {string} - Date string in YYYY-MM-DD format
     */
    calculateTodaysPuzzleDate() {
        const today = new Date();
        const puzzleDate = new Date(today.getFullYear() - this.yearOffset, today.getMonth(), today.getDate());
        const year = puzzleDate.getFullYear();
        const month = String(puzzleDate.getMonth() + 1).padStart(2, '0');
        const day = String(puzzleDate.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Check if a puzzle date is too recent (beyond today minus yearOffset)
     * @param {string} filePath - Path to the puzzle file
     * @returns {boolean} - True if the puzzle date is too recent
     */
    isPuzzleDateTooRecent(filePath) {
        const puzzleDate = this.extractDateFromPath(filePath);
        if (!puzzleDate) {
            return false; // If no date found, allow it
        }
        
        const puzzleDateObj = new Date(puzzleDate);
        const today = new Date();
        const allowedDate = new Date(today.getFullYear() - this.yearOffset, today.getMonth(), today.getDate());
        
        return puzzleDateObj > allowedDate;
    }

    async loadPuzzle(jsonPath = null) {
        try {
            // If no specific path provided, determine path from URL parameters or use today's date
            if (!jsonPath) {
                const pathResult = this.determinePuzzlePath();
                if (pathResult.tooRecent) {
                    this.showPuzzleNotPlayableMessage();
                    return;
                }
                jsonPath = pathResult.path;
            } else {
                // Check if manually provided path has a date that's too recent
                if (this.isPuzzleDateTooRecent(jsonPath)) {
                    this.showPuzzleNotPlayableMessage();
                    return;
                }
            }

            // Extract date from the filename
            const publicationDate = this.extractDateFromPath(jsonPath);
            if (!publicationDate) {
                throw new Error('Failed to extract date from filename');
            }

            // Calculate the display date using the year offset
            const displayDate = this.calculateDisplayDate(publicationDate);

            const response = await fetch(jsonPath);
            if (!response.ok) {
                throw new Error(`Failed to load puzzle: ${response.status}`);
            }

            const puzzleData = await response.json();
            this.puzzle = puzzleData.body[0];
            this.puzzle.date = displayDate;
            
            // Update page title and info
            this.updatePuzzleInfo(puzzleData, jsonPath);
            
            // Generate the grid and clues
            this.generateGrid();
            this.generateClues();
            
            // Initialize the crossword puzzle directly without global variables
            this.crosswordInstance = new CrosswordPuzzle(this.puzzle);
            
        } catch (error) {
            console.error('Error loading puzzle:', error);
            this.showError(error.message);
        }
    }

    determinePuzzlePath() {
        // Check URL parameters first
        const urlParams = new URLSearchParams(window.location.search);
        const puzzleParam = urlParams.get('puzzle');
        
        if (puzzleParam) {
            // If puzzle parameter is provided, check if date is too recent
            let filePath;
            if (puzzleParam.endsWith('.json')) {
                filePath = `crosswords/${puzzleParam}`;
            } else {
                filePath = `crosswords/${puzzleParam}.json`;
            }
            
            const tooRecent = this.isPuzzleDateTooRecent(filePath);
            return { path: filePath, tooRecent: tooRecent };
        }

        // Calculate today's puzzle date using yearOffset
        const dateString = this.calculateTodaysPuzzleDate();
        
        return { path: `crosswords/mini_${dateString}.json`, tooRecent: false };
    }

    updatePuzzleInfo(puzzleData, jsonPath) {
        const date = puzzleData.publicationDate || 'Unknown';
        const constructor = puzzleData.constructors ? puzzleData.constructors.join(', ') : 'Unknown';
        const puzzleName = jsonPath.split('/').pop().replace('.json', '');
        
        document.getElementById('puzzleTitle').textContent = puzzleName.split('_').join(' ').replace('.json', '');
        document.getElementById('puzzleInfo').innerHTML = `<strong>Date:</strong> ${date} | <strong>Constructor:</strong> ${constructor}`;
        document.title = `${puzzleName} - Interactive Crossword`;
    }

    generateGrid() {
        const grid = document.getElementById('crossword');
        const { width } = this.puzzle.dimensions;
        
        // Set grid template columns with responsive sizing
        grid.style.gridTemplateColumns = `repeat(${width}, var(--cell-size, 80px))`;
        
        let gridHTML = '';
        this.puzzle.cells.forEach((cell, index) => {
            if (!cell || Object.keys(cell).length === 0) {
                gridHTML += `<div class="cell black" data-index="${index}"></div>`;
            } else {
                gridHTML += `<div class="cell-wrapper" data-index="${index}" style="position: relative;">
                    <input class="cell" type="text" maxlength="1" data-index="${index}">
                    ${cell.label ? `<span class="cell-number">${cell.label}</span>` : ''}
                </div>`;
            }
        });
        
        grid.innerHTML = gridHTML;
    }

    generateClues() {
        const container = document.getElementById('cluesContainer');
        let cluesHTML = '';
        
        this.puzzle.clueLists.forEach(clueList => {
            cluesHTML += `<div class="clue-group">
                <h3>${clueList.name}</h3>
                <ul class="clue-list">`;
            
            clueList.clues.forEach(clueIndex => {
                const clue = this.puzzle.clues[clueIndex];
                const clueText = clue.text[0].plain;
                cluesHTML += `<li class="clue-item" data-clue-index="${clueIndex}">
                    <span class="clue-number">${clue.label}</span> ${clueText}
                </li>`;
            });
            
            cluesHTML += `</ul></div>`;
        });
        
        container.innerHTML = cluesHTML;
    }



    showPuzzleNotPlayableMessage() {
        // Hide the main content areas
        document.querySelector('.container').style.display = 'none';
        document.querySelector('.timer').style.display = 'none';
        
        // Hide specific buttons
        document.getElementById('pauseBtn').style.display = 'none';
        document.getElementById('leaderboardBtn').style.display = 'none';
        document.getElementById('persistentShareBtn').style.display = 'none';
        
        // Hide the game overlay (start the game popup)
        document.getElementById('gameOverlay').style.display = 'none';
        
        // Update page title
        document.getElementById('puzzleTitle').textContent = 'Puzzle Not Available';
        document.getElementById('puzzleInfo').innerHTML = 'This puzzle is not yet available for play.';
    }

    showError(message) {
        document.getElementById('puzzleTitle').textContent = 'Error Loading Puzzle';
        document.getElementById('puzzleInfo').innerHTML = `<strong>Error:</strong> ${message}`;
        document.getElementById('crossword').innerHTML = `<div style="padding: 20px; text-align: center; color: #ff6b6b;">Failed to load puzzle. Please check the URL or try again later.</div>`;
        document.getElementById('cluesContainer').innerHTML = '';
    }
}

/**
 * Initialize crossword when page loads
 * 
 * Configuration options for yearOffset (default: 11):
 * 1. Set window.CROSSWORD_YEAR_OFFSET = number before this script loads
 * 2. Add data-year-offset="number" attribute to <body> tag
 * 3. Use default value of 11 years
 * 
 * Example configurations:
 * - <script>window.CROSSWORD_YEAR_OFFSET = 10;</script>
 * - <body data-year-offset="12">
 */
window.addEventListener('DOMContentLoaded', async () => {
    // Check for custom yearOffset configuration
    // Priority: 1) global variable 2) data attribute on body 3) default (11)
    let yearOffset = 11; // default
    
    if (typeof window.CROSSWORD_YEAR_OFFSET !== 'undefined') {
        yearOffset = window.CROSSWORD_YEAR_OFFSET;
    } else if (document.body.dataset.yearOffset) {
        yearOffset = parseInt(document.body.dataset.yearOffset, 10);
    }
    
    const loader = new CrosswordLoader(yearOffset);
    await loader.loadPuzzle();
});
