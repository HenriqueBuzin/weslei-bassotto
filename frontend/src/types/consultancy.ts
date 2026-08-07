export type QuestionType = "text" | "textarea" | "number" | "select" | "boolean";
export type AnswerValue = string | number;

export type Question = {
  id: string;
  label: string;
  type: QuestionType;
  options: string[];
  required: boolean;
  active: boolean;
  order: number;
};

export type QuestionForm = Omit<Question, "id" | "options"> & { options: string };

export type SubmissionAnswer = {
  question_id: string;
  label: string;
  value: AnswerValue | null;
};

export type Customer = {
  name: string;
  email: string;
  phone: string;
};

export type ContractPlan = {
  slug: string;
  name: string;
  months: number;
  start_date: string;
  end_date: string;
};

export type Renewal = {
  created_at: string;
  plan_name: string;
  start_date: string;
  end_date: string;
};

export type Submission = {
  id: string;
  customer: Customer;
  plan: ContractPlan;
  status: string;
  answers: SubmissionAnswer[];
  renewal_count: number;
  renewals: Renewal[];
  payment_reference?: string | null;
  recurrence_status?: string | null;
  recurrence_issue?: string | null;
  answers_changed_at?: string | null;
  questionnaire_changed_at?: string | null;
  answers_seen_at?: string | null;
};

export type AdminEvent = {
  id: string;
  type: string;
  created_at: string;
  seen_at?: string | null;
};

export type SubmissionPatch = Partial<{
  status: string;
  start_date: string;
  end_date: string;
  payment_reference: string;
}>;
