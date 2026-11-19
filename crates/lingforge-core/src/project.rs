use crate::{AppError, ErrorCode};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProjectMetadata {
    pub name: String,
    pub language_name: String,
    pub description: String,
}

impl ProjectMetadata {
    pub fn validate(&self) -> Result<(), AppError> {
        if self.name.trim().is_empty() || self.name.chars().count() > 120 {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Project name must contain 1–120 characters.",
            ));
        }
        if self.language_name.chars().count() > 120 || self.description.chars().count() > 10_000 {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Language name or description is too long.",
            ));
        }
        if self
            .name
            .chars()
            .chain(self.language_name.chars())
            .any(char::is_control)
            || self.description.contains('\0')
        {
            return Err(AppError::new(
                ErrorCode::InvalidInput,
                "Metadata contains unsupported control characters.",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub metadata: ProjectMetadata,
    pub revision: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TextSize {
    #[default]
    Standard,
    Comfortable,
    Large,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Motion {
    #[default]
    System,
    Reduced,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Preferences {
    pub text_size: TextSize,
    pub motion: Motion,
}
