export interface ConnectedRepository {
  id: string;
  user_id: string;
  github_repo_id: number;
  owner: string;
  repo_name: string;
  branch: string;
  created_at: string;
  updated_at: string;
}

export interface UserProjectsResponse {
  projects: ConnectedRepository[];
  total_projects: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
}
