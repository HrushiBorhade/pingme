# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.1] - 2026-02-09

### Fixed
- Fixed package.json bin path (removed leading `./`)
- Normalized repository URL format in package.json

### Documentation
- Updated SECURITY.md with correct package name (@hrushiborhade/pingme)
- Updated contact email in SECURITY.md (hrushiborhade123@gmail.com)
- Fixed all npm install commands to use correct package name

## [1.2.0] - 2026-02-09

### Security
- **CRITICAL**: Added JSON validation with error recovery for `settings.json`
- **HIGH**: Changed hook script permissions from 0o755 to 0o700 (owner-only access)
- **HIGH**: Added write permission checks before modifying configuration files
- **MEDIUM**: Added symlink attack prevention when creating hook scripts
- **MEDIUM**: Improved type safety in settings.json manipulation with type guards
- **MEDIUM**: Enhanced error handling and logging throughout
- **LOW**: Strict input validation for Twilio credentials (regex patterns)
- **LOW**: Added file integrity verification after writes

### Changed
- Version now read from package.json (single source of truth)
- Improved error messages for configuration issues
- Enhanced logging with `[pingme]` prefix for better visibility

### Documentation
- Added comprehensive [SECURITY.md](SECURITY.md) with security policy
- Expanded README security section with detailed security features
- Added SECURITY_FIXES.md with detailed fix descriptions
- Added IMPLEMENTATION_SUMMARY.md with complete implementation overview

### Fixed
- Fixed TOCTOU race condition in config file reading
- Fixed silent failures when config directory is not writable
- Fixed potential credential exposure on shared systems

## [1.1.1] - 2026-02-07

### Fixed
- Synced package-lock.json version

### Documentation
- Updated README description for clarity

## [1.1.0] - 2026-02-07

### Added
- Support for all 14 Claude Code hook events
- Configurable event selection (enable/disable specific events)
- `events` command to reconfigure which events trigger SMS
- Event matcher support for `PostToolUse` event

### Changed
- Improved event descriptions and hints
- Better UX with emoji indicators for spammy events
- Enhanced hook script with event-specific emojis

### Documentation
- Updated README with complete event list
- Added event configuration instructions

## [1.0.0] - 2026-02-06

### Added
- Initial release
- SMS notifications via Twilio
- Hook integration with Claude Code
- Support for basic events (completed, stopped, question, permission)
- tmux session detection
- Context extraction from JSON input
- Shell injection prevention
- Input sanitization
- Test command to verify setup
- Uninstall command

### Security
- Shell injection prevention with comprehensive escaping
- Credential sanitization
- Input truncation to 280 characters
- Non-printable character filtering

---

[1.2.1]: https://github.com/HrushiBorhade/pingme/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/HrushiBorhade/pingme/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/HrushiBorhade/pingme/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/HrushiBorhade/pingme/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/HrushiBorhade/pingme/releases/tag/v1.0.0
