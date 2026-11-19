//! Platform-independent domain foundation. No Tauri, database, or UI dependencies.

use serde::Serialize;

pub mod automation;
pub mod font;
pub mod glyph;
pub mod glyph_edit;
pub mod lexicon;
pub mod notebook;
pub mod phonology;
pub mod project;
pub mod writing;

pub const APPLICATION_NAME: &str = "LingForge";

/// Stable wire codes; messages may change without breaking callers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    Unavailable,
    InvalidInput,
    Internal,
    Io,
    Conflict,
    Locked,
    UnsupportedVersion,
    InvalidProject,
}

/// User-safe errors crossing application boundaries. Do not include file contents
/// or platform diagnostics here; keep those in developer diagnostics.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    pub message: String,
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for AppError {}

impl AppError {
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn error_wire_format_has_stable_code_and_safe_message() {
        let error = AppError {
            code: ErrorCode::Unavailable,
            message: "This operation is unavailable.".into(),
        };
        assert_eq!(
            serde_json::to_value(&error).unwrap(),
            serde_json::json!({
                "code": "unavailable",
                "message": "This operation is unavailable."
            })
        );
        assert_eq!(error.to_string(), "This operation is unavailable.");
    }
}
