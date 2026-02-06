export interface ProjectSummary {
  project_id: string;
  project_name: string;
  report_id: string;
  overall_score: number;
  total_files: number;
  files_with_tests: number;
  test_coverage_percentage: number;
  average_score: number;
  analysis_date: string;
  analyzed_files_count: number;
  avg_file_score: number;
}

export interface SingleProjectResponse {
  project_summary: ProjectSummary;
  total_reports: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
