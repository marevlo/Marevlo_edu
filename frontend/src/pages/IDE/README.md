# IDE Component Architecture

This directory contains a modular, well-organized IDE (Integrated Development Environment) for coding challenges.

## 📁 Component Structure

```
IDE/
├── IDE.jsx                    # Main orchestrator component
├── ProblemPanel.jsx          # Problem description & metadata
├── EditorToolbar.jsx         # Toolbar with action buttons
├── CodeEditor.jsx            # Code editing area with line numbers
├── ConsolePanel.jsx          # Collapsible console output
├── EnvironmentWarning.jsx    # Environment information banner
├── StatusNotification.jsx    # Success/error notifications
├── EmptyState.jsx            # No problem selected state
├── index.js                  # Central export point
└── README.md                 # This file
```

## 🎨 Component Overview

### **IDE.jsx** (Main Component)
- **Purpose**: Orchestrates all sub-components and manages global state
- **State Management**: 
  - Code content
  - Console output
  - Execution status
  - Submission attempts
- **Key Features**:
  - Code execution via Piston API
  - Submission handling
  - State coordination between components

### **ProblemPanel.jsx**
- **Purpose**: Displays problem information
- **Features**:
  - Problem title and ID
  - Difficulty badge with color coding
  - Tags display
  - Markdown-rendered description
  - Examples and constraints
- **Styling**: Gradient header, color-coded difficulty levels

### **EditorToolbar.jsx**
- **Purpose**: Action buttons for code manipulation
- **Actions**:
  - Copy code to clipboard
  - Reset to starter code
  - Run code (test)
  - Submit solution
- **Styling**: Gradient backgrounds, disabled states, hover effects

### **CodeEditor.jsx**
- **Purpose**: Main code editing interface
- **Features**:
  - Line numbers gutter
  - Syntax-ready textarea
  - Monospace font
  - Custom caret and selection colors
- **Styling**: Gradient line number gutter

### **ConsolePanel.jsx**
- **Purpose**: Display code execution output
- **Features**:
  - Collapsible panel
  - Color-coded output (success/error/running)
  - Preview in collapsed state
- **States**: idle, running, success, error

### **EnvironmentWarning.jsx**
- **Purpose**: Display important environment information
- **Styling**: Warm gradient background with amber tones

### **StatusNotification.jsx**
- **Purpose**: Show submission results
- **Variants**:
  - Success notification with "Next Problem" button
  - First attempt error with dismiss option
  - Multiple attempts error with try again/skip options
- **Styling**: Gradient backgrounds, smooth animations

### **EmptyState.jsx**
- **Purpose**: Placeholder when no problem is selected
- **Styling**: Gradient background with centered icon

## 🎨 Design System

### Color Palette
- **Neutral**: Gray scale for backgrounds and text
- **Success**: Emerald tones for accepted solutions
- **Error**: Rose tones for wrong answers
- **Warning**: Amber tones for environment notices
- **Accent**: Black/dark gray for primary actions

### Gradients
- Background: `from-neutral-50 to-neutral-100`
- Success: `from-emerald-500 to-emerald-600`
- Error: `from-rose-100 to-rose-200`
- Warning: `from-amber-50 to-orange-50`
- Primary button: `from-neutral-900 to-neutral-700`

### Typography
- **Code**: Monospace font family
- **Headings**: Bold, neutral-900
- **Body**: Regular, neutral-700
- **Muted**: neutral-600

## 🔄 Data Flow

```
IDE (Parent)
├── State Management
│   ├── code
│   ├── output
│   ├── status
│   └── attempts
│
├── ProblemPanel
│   └── Receives: problem, onBack
│
├── EditorToolbar
│   └── Receives: callbacks, isRunning, copied
│
├── CodeEditor
│   └── Receives: code, onChange
│
├── ConsolePanel
│   └── Receives: output, status, isExpanded, onToggle
│
└── StatusNotification
    └── Receives: status, attempts, onNext, onDismiss
```

## 🚀 Usage

```jsx
import IDE from './pages/IDE';

function App() {
  return (
    <IDE
      problem={currentProblem}
      onBack={() => navigate('/problems')}
      onNext={() => loadNextProblem()}
      onSolved={() => markAsSolved()}
    />
  );
}
```

## 🛠️ Key Features

1. **Modular Architecture**: Each component has a single responsibility
2. **Clean Separation**: Logic separated from presentation
3. **Reusability**: Components can be used independently
4. **Type Safety Ready**: Easy to add TypeScript types
5. **Performance**: Memoized components where appropriate
6. **Accessibility**: ARIA labels and semantic HTML
7. **Responsive**: Adapts to different screen sizes
8. **Beautiful UI**: Modern gradients, shadows, and animations

## 📝 Future Enhancements

- [ ] Add syntax highlighting to CodeEditor
- [ ] Support multiple programming languages
- [ ] Add keyboard shortcuts component
- [ ] Implement test case runner
- [ ] Add file explorer for multi-file problems
- [ ] Theme switcher (light/dark mode)
- [ ] Code formatting/linting integration
