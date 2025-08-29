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
        this.showFeedback = false; // Feedback is disabled by default
        this.gameStarted = false; // Track if game has been started
        this.init();
    }
    
    init() {
        this.setupGrid();
        this.setupTimer();
        this.setupEventListeners();
        this.blurClues();
        this.showGameOverlay();
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
            overlay.style.display = 'flex';
            // Setup start button event listener
            const startBtn = document.getElementById('startGameBtn');
            if (startBtn) {
                startBtn.addEventListener('click', () => this.startGame());
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
                    <button class="start-game-btn" onclick="crosswordInstance.resumeFromPause()">Resume Game</button>
                `;
            }
            overlay.style.display = 'flex';
            overlay.style.animation = 'fadeIn 0.3s ease';
        }
    }
    
    resumeFromPause() {
        this.startTimer();
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
        // Set the grid columns dynamically based on puzzle width
        const grid = document.querySelector('.grid');
        if (grid && this.puzzle.dimensions) {
            grid.style.gridTemplateColumns = `repeat(${this.puzzle.dimensions.width}, 80px)`;
        }
    }
    
    setupTimer() {
        const startBtn = document.getElementById('startBtn');
        const pauseBtn = document.getElementById('pauseBtn');
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        const feedbackToggle = document.getElementById('feedbackToggle');
        
        startBtn.addEventListener('click', () => this.startTimer());
        pauseBtn.addEventListener('click', () => this.pauseTimer());
        
        if (persistentShareBtn) {
            persistentShareBtn.addEventListener('click', () => this.shareScore());
        }
        
        if (feedbackToggle) {
            feedbackToggle.addEventListener('change', (e) => this.toggleFeedback(e.target.checked));
        }
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
        
        document.getElementById('startBtn').disabled = true;
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
        
        document.getElementById('startBtn').disabled = false;
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
            this.handleKeyPress(e);
        });
        
        // Setup cell event listeners
        document.querySelectorAll('.cell:not(.black)').forEach((cell, index) => {
            const cellIndex = parseInt(cell.dataset.index);
            cell.addEventListener('click', (e) => this.handleCellClick(cellIndex));
            cell.addEventListener('input', (e) => this.handleInput(e, cellIndex));
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
        const cells = document.querySelectorAll('.cell');
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
        cells.forEach(cell => cell.classList.remove('selected', 'highlighted'));
        clueItems.forEach(item => item.classList.remove('selected'));
        
        // Set new selection
        this.selectedCell = index;
        this.selectedClue = targetClueIndex;
        
        cells[index].classList.add('selected');
        cells[index].focus();
        cells[index].select(); // Auto-select existing text for easy replacement
        
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
        
        const cells = document.querySelectorAll('.cell');
        cells.forEach(cell => cell.classList.remove('selected', 'highlighted'));
        
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
        
        const targetCell = cells[targetCellIndex];
        if (targetCell) {
            targetCell.focus();
            targetCell.select(); // Auto-select existing text for easy replacement
            this.selectedCell = targetCellIndex;
            targetCell.classList.add('selected');
        }
        
        // Start timer on first interaction (only if game has been started)
        if (this.gameStarted && !this.isRunning && !this.isPaused) {
            this.startTimer();
        }
    }
    
    highlightWord(clueIndex) {
        const clue = this.puzzle.clues[clueIndex];
        const cells = document.querySelectorAll('.cell');
        
        clue.cells.forEach(cellIndex => {
            if (cells[cellIndex]) {
                cells[cellIndex].classList.add('highlighted');
            }
        });
    }
    
    handleInput(event, cellIndex) {
        const value = event.target.value.toUpperCase();
        const cell = this.puzzle.cells[cellIndex];
        
        if (value && value.match(/[A-Z]/)) {
            this.userAnswers[cellIndex] = value;
            event.target.value = value;
            
            // Only show feedback if enabled
            if (this.showFeedback && cell) {
                if (cell.answer === value) {
                    event.target.style.setProperty('background', '#c8e6c9', 'important');
                } else {
                    event.target.style.setProperty('background', '#ffcdd2', 'important');
                }
            } else {
                event.target.style.removeProperty('background');
            }
            
            // Check for puzzle completion
            this.checkPuzzleCompletion();
            
            // Move to next cell
            this.moveToNextCell(cellIndex);
        } else {
            event.target.value = '';
            delete this.userAnswers[cellIndex];
            event.target.style.removeProperty('background');
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
        
        // Show completion message
        const completionMessage = document.getElementById('completionMessage');
        const finalTime = document.getElementById('finalTime');
        finalTime.textContent = this.formatTime(this.elapsedTime);
        completionMessage.style.display = 'block';
        
        // Setup share button
        const shareBtn = document.getElementById('shareBtn');
        shareBtn.addEventListener('click', () => this.shareScore());
        
        // Hide completion message after 5 seconds
        setTimeout(() => {
            completionMessage.style.display = 'none';
        }, 5000);
        
        document.getElementById('startBtn').disabled = true;
        document.getElementById('pauseBtn').disabled = true;
        
        // Enable the persistent share button
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        if (persistentShareBtn) {
            persistentShareBtn.disabled = false;
        }
    }
    
    shareScore() {
        const puzzleTitle = document.querySelector('.title').textContent;
        const completionTime = this.formatTime(this.elapsedTime);
        const puzzleDate = puzzleTitle.split(' ')[1]; // Extract date from title like "mini 2014-08-21"
        
        // Check if puzzle is actually completed
        if (!this.elapsedTime || this.elapsedTime === 0) {
            this.showPersistentShareFeedback('Complete the puzzle first!');
            return;
        }
        
        const shareText = `🧩 ${puzzleTitle} completed!\n⏱️ Time: ${completionTime}\n\n`;
        
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
    
    fallbackCopyToClipboard(text) {
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
            this.showPersistentShareFeedback('Score copied to clipboard!');
        } catch (err) {
            this.showPersistentShareFeedback('Unable to copy to clipboard');
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
    
    showPersistentShareFeedback(message) {
        const persistentShareBtn = document.getElementById('persistentShareBtn');
        if (!persistentShareBtn) return;
        
        const originalText = persistentShareBtn.textContent;
        persistentShareBtn.textContent = message;
        
        setTimeout(() => {
            persistentShareBtn.textContent = originalText;
        }, 2000);
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
        const cells = document.querySelectorAll('.cell');
        
        // Remove selected class from current cell
        cells.forEach(cell => cell.classList.remove('selected'));
        
        // Set new selected cell
        this.selectedCell = index;
        cells[index].classList.add('selected');
        cells[index].focus();
        cells[index].select(); // Auto-select existing text for easy replacement
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
    
    handleKeyPress(event) {
        if (this.selectedCell === null) return;
        
        const { width, height } = this.puzzle.dimensions;
        const currentRow = Math.floor(this.selectedCell / width);
        const currentCol = this.selectedCell % width;
        
        let nextIndex = null;
        
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
                const currentCell = document.querySelector(`[data-index="${this.selectedCell}"]`);
                if (currentCell && currentCell.value) {
                    currentCell.value = '';
                    delete this.userAnswers[this.selectedCell];
                    currentCell.style.removeProperty('background');
                } else if (this.selectedClue !== null) {
                    // Move to previous cell in word
                    const clue = this.puzzle.clues[this.selectedClue];
                    const currentPosition = clue.cells.indexOf(this.selectedCell);
                    if (currentPosition > 0) {
                        const prevCellIndex = clue.cells[currentPosition - 1];
                        this.moveToCell(prevCellIndex);
                    }
                }
                event.preventDefault();
                break;
        }
        
        if (nextIndex !== null) {
            const nextCell = this.puzzle.cells[nextIndex];
            if (nextCell && Object.keys(nextCell).length > 0) {
                this.selectCell(nextIndex);
            }
            event.preventDefault();
        }
    }
}

// Initialize the crossword puzzle when the page loads
let crosswordInstance;
window.addEventListener('DOMContentLoaded', () => {
    if (typeof puzzleData !== 'undefined') {
        crosswordInstance = new CrosswordPuzzle(puzzleData);
    }
});
