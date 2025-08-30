
export enum WorkerStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
}

export interface WorkerState {
  id: number;
  status: WorkerStatus;
}

export enum StepAction {
  TYPE = 'type',
  CLICK = 'click',
}

export interface AutomationStep {
  step: string;
  action: StepAction;
  selector: string;
  value?: string;
}

export enum StepStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  ERROR = 'error',
}

export interface StepState extends AutomationStep {
  id: number;
  status: StepStatus;
  workerId: number | null;
}

export interface SandboxBrowserState {
  usernameValue: string;
  passwordValue: string;
  isButtonClicked: boolean;
}
