# Database Schema for Flawlesst API

This directory contains the database schema for the project analysis and reporting system.

## Tables

### projects

Main projects table (assumed to exist, included for completeness)

### project_reports

Stores master analysis reports for each project run

**Columns:**

- `id`: UUID (Primary Key)
- `project_id`: UUID (Foreign Key to projects)
- `overall_score`: Integer (0-100) - Overall project automation score
- `summary`: Text - AI-generated executive summary
- `total_files`: Integer - Total number of files analyzed
- `files_with_tests`: Integer - Number of files that have tests
- `average_score`: Decimal (0-10) - Average score across all files
- `created_at`: Timestamp - When the analysis was completed

### file_analysis

Stores individual file analysis results for detailed drill-down

**Columns:**

- `id`: UUID (Primary Key)
- `report_id`: UUID (Foreign Key to project_reports)
- `file_path`: Text - Relative path to the analyzed file
- `score`: Integer (0-10) - Individual file automation score
- `has_tests`: Boolean - Whether the file has associated tests
- `test_type`: Enum ('unit', 'integration', 'e2e', 'none')
- `suggestions`: JSONB array - AI-generated improvement suggestions
- `created_at`: Timestamp - When the file was analyzed

## Features

### Performance Optimizations

- Indexes on frequently queried columns
- Composite indexes for common query patterns
- Optimized for both reporting and detail views

### Security

- Row Level Security (RLS) enabled for multi-tenant support
- Policies restrict access to user's own projects
- Secure by default architecture

### Analytics

- `project_analysis_summary` view for quick reporting
- `get_project_insights()` function for detailed analytics
- Pre-calculated metrics for fast dashboard loading

### Data Integrity

- CHECK constraints on score ranges
- Foreign key constraints with CASCADE deletes
- NOT NULL constraints on critical fields

## Usage Examples

### Get Latest Report for a Project

```sql
SELECT * FROM project_reports
WHERE project_id = $1
ORDER BY created_at DESC
LIMIT 1;
```

### Get File Analysis Details

```sql
SELECT file_path, score, has_tests, suggestions
FROM file_analysis
WHERE report_id = $1
ORDER BY score ASC;
```

### Get Project Analytics Summary

```sql
SELECT * FROM project_analysis_summary
WHERE project_id = $1;
```

### Get Detailed Insights

```sql
SELECT * FROM get_project_insights($1);
```

## Setup

1. Run the schema.sql file in your Supabase project
2. Set up the RLS policies based on your auth system
3. Configure environment variables in your Lambda functions:
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_SERVICE_KEY`: Service role key for server-side access

## Scaling Considerations

- The schema is designed to handle thousands of projects
- JSONB fields allow for flexible AI response storage
- Partitioning can be added for very large datasets
- Consider archiving old reports for long-running projects
