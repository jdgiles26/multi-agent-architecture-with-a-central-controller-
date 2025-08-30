
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { generateAutomationPlan } from './services/geminiService';
import type { WorkerState, StepState, SandboxBrowserState, AutomationStep } from './types';
import { WorkerStatus, StepAction, StepStatus } from './types';
import { TypeIcon, ClickIcon, CheckCircleIcon, XCircleIcon, PlayIcon, LoadingSpinner } from './components/icons';

const NUM_WORKERS = 4;
const TASK_DELAY_MS = 1500;

// -- Child Components -- //

const SandboxBrowser: React.FC<{ state: SandboxBrowserState }> = ({ state }) => {
  return (
    <div className="bg-gray-800 rounded-lg p-3 h-full flex flex-col">
      <div className="flex items-center space-x-1 mb-2">
        <div className="w-3 h-3 bg-red-500 rounded-full"></div>
        <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
        <div className="w-3 h-3 bg-green-500 rounded-full"></div>
      </div>
      <div className="bg-gray-900 rounded-t-md px-2 py-1 text-xs text-gray-400 truncate">
        https://sandbox.local/login
      </div>
      <div className="bg-white text-gray-900 flex-grow rounded-b-md p-4 flex flex-col justify-center space-y-3">
        <input
          id="username"
          type="text"
          placeholder="Username"
          readOnly
          value={state.usernameValue}
          className="w-full px-3 py-2 border border-gray-300 rounded-md transition-all duration-300"
        />
        <input
          id="password"
          type="password"
          placeholder="Password"
          readOnly
          value={state.passwordValue}
          className="w-full px-3 py-2 border border-gray-300 rounded-md transition-all duration-300"
        />
        <button
          className={`w-full py-2 px-4 text-white font-semibold rounded-md transition-all duration-300 .btn-login ${state.isButtonClicked ? 'bg-blue-700 animate-pulse' : 'bg-blue-600 hover:bg-blue-700'}`}
        >
          Log In
        </button>
      </div>
    </div>
  );
};

const WorkerCard: React.FC<{ worker: WorkerState; browserState: SandboxBrowserState }> = ({ worker, browserState }) => {
  const statusColors = {
    [WorkerStatus.IDLE]: 'bg-green-500',
    [WorkerStatus.BUSY]: 'bg-yellow-500',
    [WorkerStatus.ERROR]: 'bg-red-500',
  };

  const statusText = {
    [WorkerStatus.IDLE]: 'Idle',
    [WorkerStatus.BUSY]: 'Executing',
    [WorkerStatus.ERROR]: 'Error',
  };

  return (
    <div className="bg-gray-900 p-3 rounded-xl shadow-lg h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm text-gray-200">Worker Agent #{worker.id}</h3>
        <div className="flex items-center space-x-2">
          <span className="text-xs font-medium text-gray-400">{statusText[worker.status]}</span>
          <div className={`w-3 h-3 rounded-full ${statusColors[worker.status]}`}></div>
        </div>
      </div>
      <div className="flex-grow min-h-0">
        <SandboxBrowser state={browserState} />
      </div>
    </div>
  );
};

const ExecutionStep: React.FC<{ step: StepState }> = ({ step }) => {
    const statusClasses = {
        [StepStatus.PENDING]: 'bg-gray-700/50 text-gray-400',
        [StepStatus.ACTIVE]: 'bg-blue-500/20 text-blue-300 ring-1 ring-blue-500',
        [StepStatus.COMPLETED]: 'bg-green-500/20 text-green-400',
        [StepStatus.ERROR]: 'bg-red-500/20 text-red-400',
    };

    const ActionIcon = step.action === StepAction.TYPE ? TypeIcon : ClickIcon;

    return (
        <li className={`flex items-center p-3 rounded-lg transition-all duration-300 ${statusClasses[step.status]}`}>
            <div className="flex-shrink-0 mr-3">
              {step.status === StepStatus.COMPLETED && <CheckCircleIcon className="w-6 h-6 text-green-500" />}
              {step.status === StepStatus.ERROR && <XCircleIcon className="w-6 h-6 text-red-500" />}
              {(step.status === StepStatus.PENDING || step.status === StepStatus.ACTIVE) && <ActionIcon className="w-6 h-6 text-gray-500" />}
            </div>
            <div className="flex-grow">
                <p className="font-medium text-gray-200">{step.step}</p>
                <p className="text-xs text-gray-400">Action: {step.action}, Selector: <code className="bg-gray-800 px-1 rounded">{step.selector}</code></p>
            </div>
            {step.workerId !== null && (
                <div className="text-xs font-semibold text-gray-300 bg-gray-600 px-2 py-1 rounded-full">
                    Worker #{step.workerId}
                </div>
            )}
        </li>
    );
};

// -- Main App Component -- //

const App: React.FC = () => {
  const [goal, setGoal] = useState<string>("Log in with username 'admin' and password 'password123'");
  const [steps, setSteps] = useState<StepState[]>([]);
  const [workers, setWorkers] = useState<WorkerState[]>(
    Array.from({ length: NUM_WORKERS }, (_, i) => ({ id: i + 1, status: WorkerStatus.IDLE }))
  );

  const initialBrowserStates = () => Object.fromEntries(
    Array.from({ length: NUM_WORKERS }, (_, i) => [i + 1, { usernameValue: '', passwordValue: '', isButtonClicked: false }])
  );

  const [workerBrowserStates, setWorkerBrowserStates] = useState<Record<number, SandboxBrowserState>>(initialBrowserStates);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const taskQueueRef = useRef<StepState[]>([]);
  const isProcessingRef = useRef<boolean>(false);

  const resetState = () => {
    setSteps([]);
    setWorkers(Array.from({ length: NUM_WORKERS }, (_, i) => ({ id: i + 1, status: WorkerStatus.IDLE })));
    setWorkerBrowserStates(initialBrowserStates());
    setError(null);
    taskQueueRef.current = [];
  };

  const handleGenerateAndRun = async () => {
    resetState();
    setIsRunning(true);
    
    try {
      const plan = await generateAutomationPlan(goal);
      const stepsWithState: StepState[] = plan.map((p, i) => ({
        ...p,
        id: i,
        status: StepStatus.PENDING,
        workerId: null,
      }));
      setSteps(stepsWithState);
      taskQueueRef.current = [...stepsWithState];
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
      setIsRunning(false);
    }
  };

  const processTaskQueue = useCallback(() => {
    if (isProcessingRef.current) return;
    isProcessingRef.current = true;

    const idleWorker = workers.find(w => w.status === WorkerStatus.IDLE);
    
    if (idleWorker && taskQueueRef.current.length > 0) {
      const task = taskQueueRef.current.shift()!;
      
      // Update worker status to busy
      setWorkers(prev => prev.map(w => w.id === idleWorker.id ? { ...w, status: WorkerStatus.BUSY } : w));
      
      // Update step to active and assign worker
      setSteps(prev => prev.map(s => s.id === task.id ? { ...s, status: StepStatus.ACTIVE, workerId: idleWorker.id } : s));
      
      // Simulate task execution
      setTimeout(() => {
        // Simulate visual browser action
        setWorkerBrowserStates(prev => {
          const newState = { ...prev };
          if (task.action === StepAction.TYPE) {
            if (task.selector === '#username') newState[idleWorker.id].usernameValue = task.value || '';
            // Fix: Corrected typo from 'idleworker' to 'idleWorker'.
            if (task.selector === '#password') newState[idleWorker.id].passwordValue = task.value || '';
          }
          if (task.action === StepAction.CLICK) {
            newState[idleWorker.id].isButtonClicked = true;
            // Reset button click animation
            setTimeout(() => {
              setWorkerBrowserStates(p => ({...p, [idleWorker.id]: {...p[idleWorker.id], isButtonClicked: false }}));
            }, 500);
          }
          return newState;
        });

        // Task completed successfully
        setSteps(prev => prev.map(s => s.id === task.id ? { ...s, status: StepStatus.COMPLETED } : s));
        setWorkers(prev => prev.map(w => w.id === idleWorker.id ? { ...w, status: WorkerStatus.IDLE } : w));
        
      }, TASK_DELAY_MS);
    } else if (taskQueueRef.current.length === 0 && steps.length > 0 && steps.every(s => s.status === StepStatus.COMPLETED || s.status === StepStatus.ERROR)) {
        setIsRunning(false);
    }
    
    isProcessingRef.current = false;
  }, [workers, steps]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isRunning || taskQueueRef.current.length > 0) {
        processTaskQueue();
      }
    }, 200); // Check queue every 200ms
    return () => clearInterval(interval);
  }, [isRunning, processTaskQueue]);

  return (
    <div className="min-h-screen bg-gray-900/50 text-gray-100 flex flex-col p-4 sm:p-6 lg:p-8 font-sans">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-white tracking-tight">Multi-Agent AI Orchestrator</h1>
        <p className="text-gray-400 mt-1">A visual simulation of an AI controller delegating browser automation tasks to worker agents.</p>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-2 gap-8 flex-grow">
        {/* Left Panel: Control & Execution Plan */}
        <div className="bg-gray-900 rounded-xl shadow-2xl p-6 flex flex-col">
          <h2 className="text-xl font-semibold text-white mb-4">Control Center</h2>
          <div className="flex flex-col space-y-4">
            <label htmlFor="goal" className="font-medium text-gray-300">Enter Automation Goal</label>
            <textarea
              id="goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              rows={3}
              className="bg-gray-800 border border-gray-700 rounded-lg p-3 text-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition w-full"
              placeholder="e.g., Log in with username 'user' and password 'pass'"
              disabled={isRunning}
            />
            <button
              onClick={handleGenerateAndRun}
              disabled={isRunning}
              className="flex items-center justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-gray-500 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-lg transition duration-300 w-full"
            >
              {isRunning ? (
                <>
                  <LoadingSpinner className="w-5 h-5 mr-2" />
                  Orchestrating...
                </>
              ) : (
                <>
                  <PlayIcon className="w-5 h-5 mr-2" />
                  Generate & Run Plan
                </>
              )}
            </button>
            {error && <div className="bg-red-500/20 text-red-300 p-3 rounded-lg text-sm">{error}</div>}
          </div>
          <div className="mt-8 flex-grow flex flex-col min-h-0">
            <h3 className="text-lg font-semibold text-white mb-3">Execution Plan</h3>
            <div className="overflow-y-auto pr-2 flex-grow">
              {steps.length > 0 ? (
                <ul className="space-y-3">
                  {steps.map(step => <ExecutionStep key={step.id} step={step} />)}
                </ul>
              ) : (
                <div className="flex items-center justify-center h-full text-gray-500 border-2 border-dashed border-gray-700 rounded-lg">
                  <p>AI-generated steps will appear here</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel: Worker Agents */}
        <div className="bg-gray-900 rounded-xl shadow-2xl p-6">
          <h2 className="text-xl font-semibold text-white mb-4">Worker Agents Pool</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full">
            {workers.map(worker => (
              <WorkerCard key={worker.id} worker={worker} browserState={workerBrowserStates[worker.id]} />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
