# Security Policy

## Reporting Security Issues

If you discover a security vulnerability in @hrushiborhade/pingme, please report it by emailing hrushiborhade123@gmail.com or opening a private security advisory on GitHub.

**Please do not report security vulnerabilities through public GitHub issues.**

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x.x   | :white_check_mark: |
| < 1.0   | :x:                |

## Security Considerations

### Credential Storage

@hrushiborhade/pingme stores Twilio credentials in plaintext in the hook script at `~/.claude/hooks/pingme.sh`. This is necessary for the hook to function, but comes with security implications:

- **File Permissions**: The hook script has `0o700` permissions (readable/writable/executable only by the owner)
- **Home Directory Security**: Ensure your home directory has proper permissions (`chmod 700 ~`)
- **Shared Systems**: On shared systems, be aware that credentials are stored locally
- **No Encryption**: Credentials are not encrypted (standard practice for shell scripts)

### Shell Injection Prevention

@hrushiborhade/pingme implements comprehensive shell injection prevention:

- All credentials are escaped using `escapeForBash()` before being written to the hook script
- The following metacharacters are properly escaped: `" $ ` \ !`
- User input is truncated to 280 characters
- Non-printable characters are filtered out
- Project names are sanitized using `tr -cd '[:alnum:]._-'`

### Input Validation

- **Twilio SID**: Must match format `AC[a-z0-9]{32}` (34 chars total)
- **Twilio Token**: Must be 32 alphanumeric characters
- **Phone Numbers**: Must match E.164 format (`+` followed by 1-15 digits)

### File System Security

- **Symlink Protection**: The installer verifies that `~/.claude/hooks` is not a symlink to prevent directory traversal attacks
- **Permission Checks**: Write permissions are verified before modifying configuration files
- **Integrity Verification**: File sizes and permissions are verified after writes
- **JSON Validation**: Configuration files are validated for proper JSON structure and schema

### Dependencies

@hrushiborhade/pingme has a minimal dependency footprint to reduce attack surface:

- Only 2 production dependencies: `@clack/prompts`, `picocolors`
- Both dependencies are audited regularly with `npm audit`
- No network libraries beyond the system's `curl` (used by the hook script)

### Rate Limiting

- **Twilio API**: Rate limiting is handled by Twilio's built-in API limits
- **Hook Cooldown**: Currently not implemented (users can disable spammy events via `npx @hrushiborhade/pingme events`)
- **Recommended**: Add custom rate limiting if needed for high-frequency events

### External Dependencies (Runtime)

The hook script requires these system utilities:

- `curl`: For making HTTP requests to Twilio API (hook silently exits if unavailable)
- `jq` (optional): For parsing JSON context (gracefully degrades if unavailable)
- `tmux` (optional): For displaying tmux session info (skipped if not in tmux)

## Security Best Practices

When using @hrushiborhade/pingme:

1. **Secure Your Home Directory**: `chmod 700 ~`
2. **Rotate Credentials**: Regularly rotate your Twilio credentials
3. **Monitor Usage**: Check Twilio logs for unexpected SMS sends
4. **Disable When Not Needed**: Use `npx @hrushiborhade/pingme events` to disable events you don't need
5. **Shared Systems**: Avoid using on untrusted multi-user systems
6. **Review Hook Script**: Periodically review `~/.claude/hooks/pingme.sh` for unexpected changes

## Known Limitations

- **Plaintext Credentials**: Required by design for shell script functionality
- **No Audit Logging**: Intentional to avoid exposing credentials in logs
- **No Built-in Rate Limiting**: Relies on Twilio's API rate limits
- **System Dependencies**: Requires `curl` for functionality (graceful degradation)

## Security Audit History

- **2026-02-09**: Comprehensive security audit completed
  - Fixed: Hook script permissions (0o755 → 0o700)
  - Fixed: JSON validation and error handling
  - Added: Write permission checks
  - Added: Symlink attack prevention
  - Added: Input validation improvements
  - Added: Type safety improvements
  - Added: File integrity verification

## Updates and Patches

Security updates are released as patch versions (e.g., 1.1.x). To update:

```bash
npm install -g @hrushiborhade/pingme@latest
```

After updating, reconfigure to regenerate the hook script with latest security fixes:

```bash
npx @hrushiborhade/pingme init
```

## Contact

For security-related questions or concerns, please contact hrushiborhade123@gmail.com or open a GitHub issue (for non-sensitive questions).
