#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function generateCrosswordHTML(jsonFile, outputFile) {
    try {
        // Read the crossword JSON file
        const crosswordData = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
        const puzzle = crosswordData.body[0];
        
        // Extract puzzle info
        const date = crosswordData.publicationDate || 'Unknown';
        const constructor = crosswordData.constructors ? crosswordData.constructors.join(', ') : 'Unknown';
        const puzzleName = path.basename(jsonFile, '.json');
        
        // Read external CSS and JS files
        const cssPath = path.join(__dirname, 'crossword.css');
        const jsPath = path.join(__dirname, 'crossword.js');
        
        let cssContent = '';
        let jsContent = '';
        
        try {
            cssContent = fs.readFileSync(cssPath, 'utf8');
        } catch (error) {
            console.warn('Warning: Could not read crossword.css, using embedded styles');
        }
        
        try {
            jsContent = fs.readFileSync(jsPath, 'utf8');
        } catch (error) {
            console.warn('Warning: Could not read crossword.js, using embedded script');
        }
        
        // Generate the HTML content
        const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${puzzleName} - Interactive Crossword</title>
    <style>
        ${cssContent}
        
        .grid {
            grid-template-columns: repeat(${puzzle.dimensions.width}, 40px);
        }
    </style>
</head>
<body>
    <h1 class="title">${puzzleName.split('_').join(' ').replace('.json', '')}</h1>
    
    <div class="puzzle-info">
        <strong>Date:</strong> ${date} | <strong>Constructor:</strong> ${constructor}
    </div>
    
    <div class="timer-section">
        <div class="timer" id="timer">00:00</div>
        <div class="timer-controls">
            <button id="startBtn">Start</button>
            <button id="pauseBtn" disabled>Pause</button>
            <button id="persistentShareBtn" disabled>📋 Share</button>
            <button id="leaderboardBtn">🏆 Leaderboard</button>
        </div>
        <div class="feedback-toggle">
            <label for="feedbackToggle">
                <input type="checkbox" id="feedbackToggle">
                Autocheck
            </label>
        </div>
    </div>
    
    <div class="container">
        <div class="crossword-grid">
            <div id="crossword" class="grid">
                ${generateGridHTML(puzzle)}
            </div>
        </div>
        
        <div class="clues-section">
            <div class="clues-container">
                ${generateCluesHTML(puzzle)}
            </div>
        </div>
    </div>
    
    <div class="game-overlay" id="gameOverlay">
        <div class="overlay-content">
            <h2 class="title">Manchat Daily<br /> Crossword Classic</h2>
            <p>A classic crossword challenge.</p>

            <h2>Ready?</h2>
        
            <button class="start-game-btn" id="startGameBtn">Start the Game</button>
        </div>
    </div>

    <div class="leaderboard-modal" id="leaderboardModal">
        <div class="leaderboard-content">
            <div class="leaderboard-header">
                <h2>🏆 Today's Leaderboard</h2>
                <button class="close-btn" id="closeLeaderboardBtn">✕</button>
            </div>
            <div class="leaderboard-body" id="leaderboardBody">
                <div class="loading">Loading leaderboard...</div>
            </div>
            <div class="leaderboard-share-section" id="leaderboardShareSection">
                <div class="completion-celebration">
                    <div class="completion-text">🎉 Your completion time: <span id="leaderboardCompletionTime"></span> 🎉</div>
                    <button id="leaderboardShareBtn" class="share-button">📋 Share Your Score</button>
                </div>
            </div>
        </div>
    </div>

    <script>
        const puzzleData = ${JSON.stringify(puzzle, null, 2)};
        
        ${jsContent}
    </script>
</body>
</html>`;

        // Write the HTML file
        fs.writeFileSync(outputFile, htmlContent, 'utf8');
        console.log(`Generated crossword HTML: ${outputFile}`);
        
    } catch (error) {
        console.error('Error generating crossword HTML:', error.message);
        process.exit(1);
    }
}

function generateGridHTML(puzzle) {
    let gridHTML = '';
    
    puzzle.cells.forEach((cell, index) => {
        if (!cell || Object.keys(cell).length === 0) {
            gridHTML += `<div class="cell black" data-index="${index}"></div>\n`;
        } else {
            const numberHTML = cell.label ? `<span class="cell-number">${cell.label}</span>` : '';
            gridHTML += `<input class="cell" type="text" maxlength="1" data-index="${index}">${numberHTML}\n`;
        }
    });
    
    return gridHTML;
}

function generateCluesHTML(puzzle) {
    let cluesHTML = '';
    
    puzzle.clueLists.forEach(clueList => {
        cluesHTML += `<div class="clue-group">
            <h3>${clueList.name}</h3>
            <ul class="clue-list">`;
        
        clueList.clues.forEach(clueIndex => {
            const clue = puzzle.clues[clueIndex];
            const clueText = clue.text[0].plain;
            cluesHTML += `<li class="clue-item" data-clue-index="${clueIndex}">
                <span class="clue-number">${clue.label}</span> ${clueText}
            </li>`;
        });
        
        cluesHTML += `</ul></div>`;
    });
    
    return cluesHTML;
}

// Command line usage
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length < 1) {
        console.log('Usage: node generate_crossword.js <input.json> [output.html]');
        console.log('Example: node generate_crossword.js crosswords/mini_2014-08-21.json crossword.html');
        process.exit(1);
    }
    
    const inputFile = args[0];
    const outputFile = args[1] || inputFile.replace('.json', '.html');
    
    if (!fs.existsSync(inputFile)) {
        console.error(`Error: Input file "${inputFile}" does not exist.`);
        process.exit(1);
    }
    
    generateCrosswordHTML(inputFile, outputFile);
}

module.exports = { generateCrosswordHTML };