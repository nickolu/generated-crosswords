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
        this.initialViewportHeight = window.innerHeight; // Store initial viewport height for keyboard detection
        this.keyboardAdjustmentTimeout = null; // For debouncing keyboard adjustments
        this.resizeTimeout = null; // For debouncing window resize events
        this.isKeyboardVisible = false; // Track keyboard state for scroll prevention
        this.init();
    }
    
    init() {
        console.log('=== INIT START ===');
        console.log('userName:', this.userName);
        console.log('isCompleted:', this.isCompleted);
        
        this.hideStartGameBtn();
        this.setupGrid();
        this.setupTimer();
        this.setupEventListeners();
        this.setupMobileClueNavigator();
        this.updateMobileNavigationVisibility(); 
        this.setupMobileDynamicSizing();
        this.blurClues();
        
        // Check if user has already completed this puzzle (only if we have a username)
        if (this.userName) {
            console.log('User has name, checking completion...');
            this.checkExistingCompletion().then(() => {
                // Only show game overlay if puzzle is not already completed
                if (!this.isCompleted) {
                    this.showGameOverlay();
                } else {
                    this.hideStartGameBtn();
                    this.hideGameOverlay();
                }
            }).catch((error) => {
                // If completion check fails, treat as not completed
                console.log('Completion check failed:', error);
                this.showGameOverlay();
            });
        } else {
            // No username
            console.log('No username, showing overlay for name');
            this.showGameOverlay();
        }
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
    
    // Loading state management
    hideStartGameBtn() {
        // Create loading overlay if it doesn't exist
        let startGameBtn = document.getElementById('startGameBtn');
        startGameBtn.style.display = 'none';
    }
    
    showStartGameBtn() {
        const startGameBtn = document.getElementById('startGameBtn');
        if (startGameBtn) {
            startGameBtn.style.display = 'inline';
        }
    }
    
    // Check if user has already completed this puzzle
    async checkExistingCompletion() {
        if (!this.puzzle.date) {
            console.log('No puzzle date, returning early');
            return;
        }
        
        try {
            // Try to load leaderboard data for this puzzle date
            const dataUrl = `data/${this.puzzle.date}.json`;
            console.log('Fetching data from:', dataUrl);
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
            
            console.log('Response status:', response.status);
            if (!response.ok) {
                // No completion data exists yet
                throw new Error('Response not ok');
            }
            
            const leaderboardData = await response.json();
            console.log('Leaderboard data:', leaderboardData);
            
            // Check if current user has a completion time
            const userCompletionTime = leaderboardData[this.userName];
            console.log('User completion time:', userCompletionTime);
            if (userCompletionTime) {
                console.log(`User ${this.userName} already completed this puzzle in ${userCompletionTime} seconds`);
                await this.restoreCompletedPuzzle(userCompletionTime);
            } else {
                console.log('User not found in leaderboard');
            }
            
        } catch (error) {
            console.log('No existing completion data found:', error);
        }
    }
    
    // Restore the puzzle to completed state with all answers filled
    async restoreCompletedPuzzle(completionTimeSeconds) {
        // Set completion state
        this.isCompleted = true;
        this.isRunning = false;
        this.isPaused = true;
        this.elapsedTime = completionTimeSeconds * 1000; // Convert to milliseconds
        this.gameStarted = true; // Mark as started so interface is active

        this.hideGameOverlay();
        
        // Fill in all the correct answers
        this.puzzle.cells.forEach((cell, index) => {
            if (cell && Object.keys(cell).length > 0 && cell.answer) {
                this.userAnswers[index] = cell.answer;
                
                // Update the visual cell with the answer
                const cellWrapper = document.querySelector(`[data-index="${index}"]`);
                const cellInput = cellWrapper?.querySelector('.cell');
                if (cellInput) {
                    cellInput.value = cell.answer;
                    // Remove empty state since cell has content
                    cellWrapper.classList.remove('empty');
                }
            }
        });
        
        // Update timer display to show completion time
        this.updateTimerDisplay();
        
        // Enable the share button (both desktop and mobile)
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        if (persistentShareBtn) {
            persistentShareBtn.disabled = false;
        }
        
        // Also enable mobile share button if it exists and is synced
        const mobileShareBtn = document.getElementById('mobileShareBtn');
        if (mobileShareBtn && persistentShareBtn) {
            mobileShareBtn.disabled = persistentShareBtn.disabled;
        }
        
        // Disable pause button since puzzle is completed (both desktop and mobile)
        const pauseBtn = document.getElementById('pauseBtn');
        if (pauseBtn) {
            pauseBtn.disabled = true;
        }
        
        // Also disable mobile pause button if it exists and is synced
        const mobilePauseBtn = document.getElementById('mobilePauseBtn');
        if (mobilePauseBtn && pauseBtn) {
            mobilePauseBtn.disabled = pauseBtn.disabled;
        }
        
        // Unblur clues since puzzle is completed
        this.unblurClues();
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
            // This method is now only called when there's no username
            // (the completion check happens separately in init() for users with usernames)
            if (!this.userName) {
                console.log('No username, showing name prompt');
                this.showNamePrompt();
                overlay.style.display = 'flex';
            } else if (!this.isCompleted) {
                this.showWelcomeOverlay();
                overlay.style.display = 'flex';
            }
        }
    }
    
    showNamePrompt() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                console.log('Setting overlay content for name prompt');
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
            
            // Show loading state while checking completion
            this.hideStartGameBtn();
            this.hideGameOverlay(); // Hide the name prompt overlay
            
            // Check if this user has already completed the puzzle
            this.checkExistingCompletion().then(() => {
                if (!this.isCompleted) {
                    this.showGameOverlay();
                }
                // If completed, just leave everything hidden (puzzle is already shown)
            }).catch(() => {
                // If completion check fails, treat as not completed
                this.showGameOverlay();
            });
        }
    }
    
    showWelcomeOverlay() {
        // Don't show welcome overlay if puzzle is already completed
        if (this.isCompleted) {
            this.hideGameOverlay();
            return;
        }
        
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                const greeting = this.userName ? `Welcome back, ${this.userName}!` : 'Welcome!';
                console.log('Setting overlay content for welcome state');
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
                    if (!this.isCompleted) {
                    this.showStartGameBtn();
                }
            }
        }
    }
    
    hideGameOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            overlay.style.display = 'none';
        }
    }
    
    showPauseOverlay() {
        const overlay = document.getElementById('gameOverlay');
        if (overlay) {
            // Update overlay content for pause state
            const overlayContent = overlay.querySelector('.overlay-content');
            if (overlayContent) {
                console.log('Setting overlay content for pause state');
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
        
        // Auto-scroll to crossword grid on mobile after starting the game
        if (window.innerWidth <= 768) {
            this.scrollToCrosswordOnStart();
            // Ensure mobile navigation is properly visible after scroll
            this.updateMobileNavigationVisibility();
            // Recalculate mobile sizing now that the overlay is hidden
            this.updateMobileDynamicSizing();
        }
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
            grid.style.gridTemplateColumns = `repeat(${this.puzzle.dimensions.width}, var(--cell-size))`;
        }
    }
    
    setupMobileClueNavigator() {
        const prevBtn = document.getElementById('prevClueBtn');
        const nextBtn = document.getElementById('nextClueBtn');
        
        if (prevBtn && nextBtn) {
            prevBtn.addEventListener('click', () => this.navigateToPreviousClue());
            nextBtn.addEventListener('click', () => this.navigateToNextClue());
        }
        
        // Initialize with empty state
        this.updateMobileClueDisplay();
        
        // Set up initial positioning (this will be enhanced by setupMobileDynamicSizing)
        this.adjustMobileClueNavigatorForKeyboard();
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

        // Auto-pause when browser tab loses focus (but not if puzzle is completed)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden && this.isRunning && !this.isPaused && this.gameStarted && !this.isCompleted) {
                this.pauseTimer();
            }
        });

        // Handle window resize to show/hide mobile navigation
        window.addEventListener('resize', () => {
            this.handleWindowResize();
        });

        // Handle orientation change on mobile devices
        window.addEventListener('orientationchange', () => {
            // Small delay to let orientation change complete
            setTimeout(() => {
                this.handleWindowResize();
                this.updateMobileDynamicSizing();
                this.updateMobileClueNavigatorPosition();
            }, 200);
        });

        // Setup mobile options menu
        this.setupMobileOptionsMenu();
        
        // Setup iOS viewport height fix
        this.setupIOSViewportFix();
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
        
        // Update all timer displays (desktop, mobile menu, and mobile main)
        const desktopTimer = document.getElementById('timer');
        const mobileTimer = document.getElementById('mobileTimer');
        const mobileTimerMain = document.getElementById('mobileTimerMain');
        
        if (desktopTimer) desktopTimer.textContent = display;
        if (mobileTimer) mobileTimer.textContent = display;
        if (mobileTimerMain) mobileTimerMain.textContent = display;
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
                wrapper.addEventListener('click', (e) => this.handleCellClick(cellIndex, e));
                // Add input cleanup for paste/edge cases (but don't handle normal typing)
                input.addEventListener('input', (e) => this.cleanupInput(e, cellIndex));

            }
        });
        
        // Setup clue event listeners
        document.querySelectorAll('.clue-item').forEach(item => {
            const clueIndex = parseInt(item.dataset.clueIndex);
            item.addEventListener('click', () => this.selectClue(clueIndex));
        });
        
        // iOS scroll prevention is disabled to allow natural scrolling behavior
        // This prevents issues with scrolling to top on iOS devices
        
        // Mobile cell scroll prevention will be set up after grid generation
    }
    
    // Setup mobile options menu functionality
    setupMobileOptionsMenu() {
        const mobileOptionsBtn = document.getElementById('mobileOptionsBtn');
        const mobileOptionsMenu = document.getElementById('mobileOptionsMenu');
        
        if (mobileOptionsBtn && mobileOptionsMenu) {
            // Toggle menu on button click
            mobileOptionsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = mobileOptionsMenu.style.display === 'block';
                mobileOptionsMenu.style.display = isVisible ? 'none' : 'block';
            });

            // Close menu when clicking outside
            document.addEventListener('click', (e) => {
                if (!mobileOptionsMenu.contains(e.target) && !mobileOptionsBtn.contains(e.target)) {
                    mobileOptionsMenu.style.display = 'none';
                }
            });

            // Connect mobile buttons to their desktop counterparts
            this.connectMobileButtons();
        }
    }

    // Connect mobile option buttons to desktop functionality
    connectMobileButtons() {
        // Pause button
        const mobilePauseBtn = document.getElementById('mobilePauseBtn');
        const desktopPauseBtn = document.getElementById('pauseBtn');
        if (mobilePauseBtn && desktopPauseBtn) {
            mobilePauseBtn.addEventListener('click', () => {
                desktopPauseBtn.click();
                this.closeMobileOptionsMenu();
            });
            // Sync disabled state
            this.syncButtonStates(mobilePauseBtn, desktopPauseBtn);
        }

        // Share button
        const mobileShareBtn = document.getElementById('mobileShareBtn');
        const desktopShareBtn = document.getElementById('persistentShareBtn');
        if (mobileShareBtn && desktopShareBtn) {
            mobileShareBtn.addEventListener('click', () => {
                desktopShareBtn.click();
                this.closeMobileOptionsMenu();
            });
            this.syncButtonStates(mobileShareBtn, desktopShareBtn);
        }

        // Leaderboard button
        const mobileLeaderboardBtn = document.getElementById('mobileLeaderboardBtn');
        const desktopLeaderboardBtn = document.getElementById('leaderboardBtn');
        if (mobileLeaderboardBtn && desktopLeaderboardBtn) {
            mobileLeaderboardBtn.addEventListener('click', () => {
                desktopLeaderboardBtn.click();
                this.closeMobileOptionsMenu();
            });
        }

        // Feedback toggle
        const mobileFeedbackToggle = document.getElementById('mobileFeedbackToggle');
        const desktopFeedbackToggle = document.getElementById('feedbackToggle');
        if (mobileFeedbackToggle && desktopFeedbackToggle) {
            mobileFeedbackToggle.addEventListener('change', (e) => {
                desktopFeedbackToggle.checked = e.target.checked;
                desktopFeedbackToggle.dispatchEvent(new Event('change'));
            });
            // Sync initial state
            mobileFeedbackToggle.checked = desktopFeedbackToggle.checked;
        }
    }

    // Sync button enabled/disabled states
    syncButtonStates(mobileBtn, desktopBtn) {
        const observer = new MutationObserver(() => {
            mobileBtn.disabled = desktopBtn.disabled;
        });
        observer.observe(desktopBtn, { attributes: true, attributeFilter: ['disabled'] });
        // Set initial state
        mobileBtn.disabled = desktopBtn.disabled;
    }

    // Close mobile options menu
    closeMobileOptionsMenu() {
        const mobileOptionsMenu = document.getElementById('mobileOptionsMenu');
        if (mobileOptionsMenu) {
            mobileOptionsMenu.style.display = 'none';
        }
    }

    // Setup iOS viewport height fix and scroll prevention
    setupIOSViewportFix() {
        if (window.innerWidth <= 768) {
            const setViewportHeight = () => {
                const pageContainer = document.querySelector('.page-container');
                if (pageContainer) {
                    // Use the actual visual viewport height
                    const vh = window.visualViewport ? window.visualViewport.height : window.innerHeight;
                    pageContainer.style.height = `${vh}px`;
                    console.log('Setting viewport height to:', vh + 'px');
                }
            };

            // Set initial height
            setViewportHeight();

            // Prevent scrolling but allow crossword interactions
            const preventScroll = (e) => {
                // Allow touch events on crossword elements
                if (e.target.closest('.cell-wrapper') || 
                    e.target.closest('.mobile-options-menu') ||
                    e.target.closest('.mobile-options-btn') ||
                    e.target.closest('.clue-item')) {
                    return true; // Allow the event
                }
                
                // Prevent scrolling everywhere else
                e.preventDefault();
                e.stopPropagation();
                return false;
            };

            // Add scroll prevention listeners
            document.addEventListener('touchmove', preventScroll, { passive: false });
            document.addEventListener('scroll', (e) => {
                e.preventDefault();
                window.scrollTo(0, 0);
            }, { passive: false });
            document.addEventListener('wheel', preventScroll, { passive: false });
            
            // Prevent scrolling on window
            window.addEventListener('scroll', () => {
                window.scrollTo(0, 0);
            }, { passive: false });

            // Update on viewport changes (keyboard show/hide)
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', setViewportHeight);
                window.visualViewport.addEventListener('scroll', preventScroll);
            } else {
                // Fallback for older browsers
                window.addEventListener('resize', setViewportHeight);
                window.addEventListener('orientationchange', () => {
                    setTimeout(setViewportHeight, 100);
                });
            }

            // Also listen for focus/blur on inputs to catch keyboard events
            document.addEventListener('focusin', (e) => {
                if (e.target.classList.contains('cell')) {
                    setTimeout(setViewportHeight, 300);
                }
            });
            
            document.addEventListener('focusout', (e) => {
                if (e.target.classList.contains('cell')) {
                    setTimeout(setViewportHeight, 300);
                }
            });

            // Force scroll position to stay at 0,0
            const lockScroll = () => {
                window.scrollTo(0, 0);
                document.body.scrollTop = 0;
                document.documentElement.scrollTop = 0;
            };
            
            // Lock scroll position repeatedly
            setInterval(lockScroll, 100);
            
            console.log('iOS viewport fix and scroll prevention enabled');
        }
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
            
            // Focus handling for mobile vs desktop
            if (window.innerWidth <= 640) {
                // On mobile, only focus if needed for keyboard input, and prevent scrolling
                // Use a more aggressive approach to prevent any scrolling
                const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                targetInput.focus({ preventScroll: true });
                // Immediately restore scroll position if it changed
                setTimeout(() => {
                    const newScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    if (Math.abs(newScrollTop - currentScrollTop) > 5) {
                        window.scrollTo({ top: currentScrollTop, behavior: 'instant' });
                    }
                }, 0);
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
    
    handleCellClick(index, event = null) {
        const cell = this.puzzle.cells[index];
        
        // Prevent default behavior and scrolling on mobile
        if (event && window.innerWidth <= 768) {
            event.preventDefault();
            // Store current scroll position to restore if needed
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            
            // Use setTimeout to restore scroll position after any potential browser scrolling
            setTimeout(() => {
                if (Math.abs((window.pageYOffset || document.documentElement.scrollTop) - currentScrollTop) > 10) {
                    window.scrollTo({ top: currentScrollTop, behavior: 'instant' });
                }
            }, 0);
        }
        
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
            
            // Focus handling for mobile vs desktop
            if (window.innerWidth <= 640) {
                // On mobile, only focus if needed for keyboard input, and prevent scrolling
                // Use a more aggressive approach to prevent any scrolling
                const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                targetInput.focus({ preventScroll: true });
                // Immediately restore scroll position if it changed
                setTimeout(() => {
                    const newScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    if (Math.abs(newScrollTop - currentScrollTop) > 5) {
                        window.scrollTo({ top: currentScrollTop, behavior: 'instant' });
                    }
                }, 0);
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
            
            // Focus handling for mobile vs desktop
            if (window.innerWidth <= 640) {
                // On mobile, only focus if needed for keyboard input, and prevent scrolling
                // Use a more aggressive approach to prevent any scrolling
                const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                targetInput.focus({ preventScroll: true });
                // Immediately restore scroll position if it changed
                setTimeout(() => {
                    const newScrollTop = window.pageYOffset || document.documentElement.scrollTop;
                    if (Math.abs(newScrollTop - currentScrollTop) > 5) {
                        window.scrollTo({ top: currentScrollTop, behavior: 'instant' });
                    }
                }, 0);
            } else {
                targetInput.focus();
                targetInput.select();
            }
        }
    }
    
    moveToNextWord() {
        if (this.selectedClue === null) return;
        
        // Find next unfilled word globally (same as navigateToNextClue)
        const nextWordClueIndex = this.findNextUnfilledWord();
        
        if (nextWordClueIndex !== null) {
            // Found next unfilled word
            this.selectClue(nextWordClueIndex);
        } else {
            // If all words are filled, fall back to sequential global navigation
            const acrossClues = this.puzzle.clueLists.find(list => 
                list.name.toLowerCase() === 'across'
            )?.clues || [];
            const downClues = this.puzzle.clueLists.find(list => 
                list.name.toLowerCase() === 'down'
            )?.clues || [];
            
            const allClues = [...acrossClues, ...downClues];
            const currentIndex = allClues.indexOf(this.selectedClue);
            
            if (currentIndex !== -1) {
                const nextIndex = (currentIndex + 1) % allClues.length;
                this.selectClue(allClues[nextIndex]);
            }
        }
    }
    
    findNextUnfilledWord() {
        // Create a global list of all clues in order (across first, then down)
        const acrossClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'across'
        )?.clues || [];
        const downClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'down'
        )?.clues || [];
        
        const allClues = [...acrossClues, ...downClues];
        const currentClueIndex = this.selectedClue;
        const currentPositionInGlobalList = allClues.indexOf(currentClueIndex);
        
        if (currentPositionInGlobalList === -1) return null;
        
        // Look for next unfilled word starting from current position + 1
        for (let i = currentPositionInGlobalList + 1; i < allClues.length; i++) {
            const clueIndex = allClues[i];
            if (this.isWordUnfilled(clueIndex)) {
                return clueIndex;
            }
        }
        
        // If we didn't find one after current position, wrap around and look from beginning
        for (let i = 0; i < currentPositionInGlobalList; i++) {
            const clueIndex = allClues[i];
            if (this.isWordUnfilled(clueIndex)) {
                return clueIndex;
            }
        }
        
        return null;
    }
    
    findPreviousUnfilledWord() {
        // Create a global list of all clues in order (across first, then down)
        const acrossClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'across'
        )?.clues || [];
        const downClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'down'
        )?.clues || [];
        
        const allClues = [...acrossClues, ...downClues];
        const currentClueIndex = this.selectedClue;
        const currentPositionInGlobalList = allClues.indexOf(currentClueIndex);
        
        if (currentPositionInGlobalList === -1) return null;
        
        // Look for previous unfilled word starting from current position - 1
        for (let i = currentPositionInGlobalList - 1; i >= 0; i--) {
            const clueIndex = allClues[i];
            if (this.isWordUnfilled(clueIndex)) {
                return clueIndex;
            }
        }
        
        // If we didn't find one before current position, wrap around and look from end
        for (let i = allClues.length - 1; i > currentPositionInGlobalList; i--) {
            const clueIndex = allClues[i];
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
                if (event.shiftKey) {
                    // Shift+Tab: Move to previous unfilled word
                    this.navigateToPreviousClue();
                } else {
                    // Tab: Move to next word in current direction, or switch direction if at end
                    this.moveToNextWord();
                }
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
            modal.style.display = 'none';
            modal.style.animation = '';
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
            // Update share button visibility for empty leaderboard
            this.updateShareButtonVisibility();
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
        
        // Update share button visibility after loading data
        this.updateShareButtonVisibility();
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
        
        // Update share button visibility for error state (no data)
        this.currentLeaderboardData = {};
        this.updateShareButtonVisibility();
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
            // Show share section if there's at least 1 time on the leaderboard
            const hasLeaderboardData = this.currentLeaderboardData && Object.keys(this.currentLeaderboardData).length > 0;
            shareSection.style.display = hasLeaderboardData ? 'block' : 'none';
        }

        const completionTimeSection = shareSection?.querySelector('.completion-time');
        if (completionTimeSection) {
            // Only show completion time if the current user has completed the puzzle
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
    
    // Legacy method - kept for compatibility but no longer used for cell selection
    // Only used for specific scenarios where scrolling is intentionally needed
    scrollToPuzzleOnMobile() {
        // Only scroll on mobile devices and only if user is far from the puzzle
        if (window.innerWidth <= 640) {
            const crosswordGrid = document.querySelector('.crossword-grid');
            if (crosswordGrid) {
                const rect = crosswordGrid.getBoundingClientRect();
                // Only scroll if the grid is significantly out of view
                if (rect.top < -100 || rect.top > window.innerHeight - 100) {
                    crosswordGrid.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                    });
                }
            }
        }
    }
    
    // Auto-scroll to crossword grid when game starts on mobile
    scrollToCrosswordOnStart() {
        const crosswordGrid = document.querySelector('.crossword-grid');
        if (crosswordGrid) {
            // Get the grid's position
            const rect = crosswordGrid.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            
            // Calculate optimal scroll position to show grid with some padding
            const targetScrollTop = window.pageYOffset + rect.top - 60; // 60px from top
            
            // Ensure we don't scroll beyond the document bounds
            const maxScrollTop = Math.max(0, document.body.scrollHeight - viewportHeight);
            const safeScrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
            
            // Smooth scroll to the calculated position
            window.scrollTo({
                top: safeScrollTop,
                behavior: 'smooth'
            });
        }
    }
    
    // Handle window resize events
    handleWindowResize() {
        // Debounce resize events
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.updateMobileNavigationVisibility();
            this.adjustMobileClueNavigatorForKeyboard();
            this.updateMobileDynamicSizing();
            this.updateMobileClueNavigatorPosition();
        }, 100); // 100ms debounce for resize events
    }

    // Show/hide mobile navigation based on window width
    updateMobileNavigationVisibility() {
        const navigator = document.getElementById('mobileClueNavigator');
        if (navigator) {
            if (window.innerWidth <= 768) {
                // Show mobile navigation
                navigator.style.display = 'flex';
                navigator.style.visibility = 'visible';
                navigator.style.opacity = '1';
            } else {
                // Hide mobile navigation on larger screens
                navigator.style.display = 'none';
                navigator.style.visibility = 'hidden';
                navigator.style.opacity = '0';
            }
        }
    }

    // Debounced version for performance
    debouncedAdjustMobileClueNavigator() {
        clearTimeout(this.keyboardAdjustmentTimeout);
        this.keyboardAdjustmentTimeout = setTimeout(() => {
            this.adjustMobileClueNavigatorForKeyboard();
        }, 50); // 50ms debounce
    }
    
    // Simplified mobile clue navigator adjustment
    adjustMobileClueNavigatorForKeyboard() {
        if (window.innerWidth <= 768) {
            const navigator = document.getElementById('mobileClueNavigator');
            
            if (navigator) {
                // Just ensure it's visible - CSS handles positioning
                navigator.style.display = 'flex';
                navigator.style.visibility = 'visible';
                navigator.style.opacity = '1';
                
                // Simplified keyboard detection - no longer used for scroll prevention
                if (window.visualViewport) {
                    const keyboardHeight = window.innerHeight - window.visualViewport.height;
                    this.isKeyboardVisible = keyboardHeight > 50;
                } else {
                    this.isKeyboardVisible = false;
                }
            }
        }
    }
    
    // Setup mobile dynamic sizing system
    setupMobileDynamicSizing() {
        if (window.innerWidth <= 768) {
            this.updateMobileDynamicSizing();
            this.setupMobileClueNavigatorPositioning();
            
            // Watch for viewport changes (keyboard show/hide)
            if (window.visualViewport) {
                window.visualViewport.addEventListener('resize', () => {
                    setTimeout(() => {
                        this.updateMobileDynamicSizing();
                        this.updateMobileClueNavigatorPosition();
                    }, 100);
                });
            }
        }
    }
    
    // Calculate and apply dynamic mobile sizing
    updateMobileDynamicSizing() {
        if (window.innerWidth > 768) return; // Only apply to mobile
        
        const root = document.documentElement;
        const puzzle = this.puzzle;
        
        if (!puzzle || !puzzle.dimensions) return;
        
        // Get available dimensions
        const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
        const viewportWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
        
        // Calculate available space for the grid
        const titleArea = document.querySelector('.title-area');
        const titleAreaHeight = titleArea ? titleArea.offsetHeight : 60;
        
        const navigatorHeight = 80; // Fixed height for the clue navigator
        const containerPadding = 16; // Container padding (top/bottom)
        const gridPadding = 16; // Grid internal padding
        const buffer = 20; // Safety buffer
        
        const availableHeight = viewportHeight - titleAreaHeight - navigatorHeight - containerPadding - buffer;
        const availableWidth = viewportWidth - containerPadding;
        
        // Calculate optimal cell size based on grid dimensions
        const gridWidth = puzzle.dimensions.width;
        const gridHeight = puzzle.dimensions.height;
        
        // Factor in grid gap (2px between cells)
        const totalGapWidth = (gridWidth - 1) * 2;
        const totalGapHeight = (gridHeight - 1) * 2;
        
        // Calculate maximum cell size that fits within available space
        const maxCellWidth = (availableWidth - totalGapWidth - gridPadding) / gridWidth;
        const maxCellHeight = (availableHeight - totalGapHeight - gridPadding) / gridHeight;
        
        // Use the smaller dimension to ensure the grid fits completely
        let cellSize = Math.floor(Math.min(maxCellWidth, maxCellHeight));
        
        // Enforce minimum and maximum sizes for usability
        const minCellSize = 28; // Minimum for touch accessibility
        const maxCellSize = 60; // Maximum to prevent overly large cells
        
        cellSize = Math.max(minCellSize, Math.min(maxCellSize, cellSize));
        
        // Calculate proportional font sizes
        const cellFontSize = Math.max(12, Math.floor(cellSize * 0.5));
        const cellNumberSize = Math.max(8, Math.floor(cellSize * 0.2));
        
        // Apply the calculated sizes via CSS custom properties
        root.style.setProperty('--mobile-cell-size', `${cellSize}px`);
        root.style.setProperty('--mobile-cell-font-size', `${cellFontSize}px`);
        root.style.setProperty('--mobile-cell-number-size', `${cellNumberSize}px`);
        root.style.setProperty('--mobile-available-height', `${availableHeight}px`);
        root.style.setProperty('--mobile-available-width', `${availableWidth}px`);
        
        console.log(`Mobile sizing: ${cellSize}px cells (${gridWidth}x${gridHeight} grid) in ${availableWidth}x${availableHeight}px space`);
    }
    
    // Setup mobile clue navigator positioning for iOS keyboard handling
    setupMobileClueNavigatorPositioning() {
        if (window.innerWidth > 768) return;
        
        // Initial positioning
        this.updateMobileClueNavigatorPosition();
        
        // Listen for focus events on input cells to handle keyboard appearance
        document.addEventListener('focusin', (e) => {
            if (e.target.classList.contains('cell')) {
                // Small delay to let keyboard animation complete
                setTimeout(() => this.updateMobileClueNavigatorPosition(), 300);
            }
        });
        
        document.addEventListener('focusout', (e) => {
            if (e.target.classList.contains('cell')) {
                // Small delay to let keyboard animation complete
                setTimeout(() => this.updateMobileClueNavigatorPosition(), 300);
            }
        });
    }
    
    // Update mobile clue navigator position based on keyboard state
    updateMobileClueNavigatorPosition() {
        if (window.innerWidth > 768) return;
        
        const navigator = document.getElementById('mobileClueNavigator');
        if (!navigator) return;
        
        // Check if this is iOS Safari
        const isIOS = /iPad|iPhone|iPod/.test(window.navigator.userAgent) || 
                     (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
        const isSafari = /Safari/.test(window.navigator.userAgent) && !/Chrome/.test(window.navigator.userAgent);
        
        // Get viewport information with fallbacks
        const windowHeight = window.innerHeight;
        let visualViewportHeight = windowHeight;
        let visualViewportOffsetTop = 0;
        
        if (window.visualViewport) {
            visualViewportHeight = window.visualViewport.height;
            visualViewportOffsetTop = window.visualViewport.offsetTop || 0;
        }
        
        // Calculate keyboard height
        const keyboardHeight = windowHeight - visualViewportHeight - visualViewportOffsetTop;
        
        // Use different thresholds for iOS vs other platforms
        const keyboardThreshold = isIOS ? 80 : 50; // iOS keyboard detection needs higher threshold
        const isKeyboardVisible = keyboardHeight > keyboardThreshold;
        
        if (isKeyboardVisible) {
            // Position navigator above the keyboard
            let bottomOffset = keyboardHeight + 10; // 10px buffer above keyboard
            
            // For iOS, add additional safe area padding
            if (isIOS && isSafari) {
                bottomOffset += 10; // Extra buffer for iOS Safari
            }
            
            navigator.style.position = 'fixed';
            navigator.style.bottom = `${bottomOffset}px`;
            navigator.style.transform = 'translateY(0)';
            navigator.style.zIndex = '1000'; // Ensure it's above everything
            
            console.log(`Keyboard detected (${isIOS ? 'iOS' : 'Other'}): ${keyboardHeight}px, positioning navigator at bottom: ${bottomOffset}px`);
        } else {
            // Position navigator at bottom of viewport
            navigator.style.position = 'fixed';
            navigator.style.bottom = '0px';
            navigator.style.transform = 'translateY(0)';
            navigator.style.zIndex = '100';
            
            console.log('No keyboard detected, positioning navigator at viewport bottom');
        }
        
        // Ensure navigator is visible
        navigator.style.visibility = 'visible';
        navigator.style.opacity = '1';
    }
    
    // Removed showScrollToTopButton method - no longer needed with simplified scrolling
    
    // Mobile Clue Navigator Methods
    updateMobileClueDisplay() {
        const clueNumberEl = document.getElementById('mobileClueNumber');
        const clueDirectionEl = document.getElementById('mobileClueDirection');
        const clueTextEl = document.getElementById('mobileClueText');
        const prevBtn = document.getElementById('prevClueBtn');
        const nextBtn = document.getElementById('nextClueBtn');
        
        // Update mobile navigator visibility based on current window size
        this.updateMobileNavigationVisibility();
        
        if (!clueNumberEl || !clueDirectionEl || !clueTextEl) {
            return;
        }
        
        if (this.selectedClue === null) {
            clueNumberEl.textContent = '';
            clueDirectionEl.textContent = '';
            clueTextEl.textContent = 'Select a clue to begin';
            if (prevBtn) prevBtn.disabled = true;
            if (nextBtn) nextBtn.disabled = true;
            return;
        }
        
        const clue = this.puzzle.clues[this.selectedClue];
        const direction = this.getClueDirection(this.selectedClue);
        
        if (clue && direction) {
            clueNumberEl.textContent = clue.label;
            clueDirectionEl.textContent = direction.charAt(0).toUpperCase() + direction.slice(1);
            clueTextEl.textContent = clue.text[0].plain;
            
            // Update button states (if buttons exist)
            if (prevBtn && nextBtn) {
                const { hasPrev, hasNext } = this.getNavigationState();
                prevBtn.disabled = !hasPrev;
                nextBtn.disabled = !hasNext;
            }
        }
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
        
        // Try to find previous unfilled word globally
        const prevUnfilledClue = this.findPreviousUnfilledWord();
        
        if (prevUnfilledClue !== null) {
            this.selectClue(prevUnfilledClue);
            return;
        }
        
        // If all words are filled, fall back to sequential global navigation
        const acrossClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'across'
        )?.clues || [];
        const downClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'down'
        )?.clues || [];
        
        const allClues = [...acrossClues, ...downClues];
        const currentIndex = allClues.indexOf(this.selectedClue);
        
        if (currentIndex !== -1) {
            const prevIndex = (currentIndex - 1 + allClues.length) % allClues.length;
            this.selectClue(allClues[prevIndex]);
        }
    }
    
    navigateToNextClue() {
        if (this.selectedClue === null) return;
        
        // Try to find next unfilled word globally
        const nextUnfilledClue = this.findNextUnfilledWord();
        
        if (nextUnfilledClue !== null) {
            this.selectClue(nextUnfilledClue);
            return;
        }
        
        // If all words are filled, fall back to sequential global navigation
        const acrossClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'across'
        )?.clues || [];
        const downClues = this.puzzle.clueLists.find(list => 
            list.name.toLowerCase() === 'down'
        )?.clues || [];
        
        const allClues = [...acrossClues, ...downClues];
        const currentIndex = allClues.indexOf(this.selectedClue);
        
        if (currentIndex !== -1) {
            const nextIndex = (currentIndex + 1) % allClues.length;
            this.selectClue(allClues[nextIndex]);
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
        grid.style.gridTemplateColumns = `repeat(${width}, var(--cell-size))`;
        
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
