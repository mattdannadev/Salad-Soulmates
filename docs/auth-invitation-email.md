# Salad Soulmates invitation email

Use this as the **Invite user** template in Supabase Auth after the sender and
redirect allow-list are configured. The application passes the recipient's name in
`{{ .Data.display_name }}` and a callback URL through `{{ .ConfirmationURL }}`.

```html
<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f5f7f2;color:#193a2a;font-family:Arial,sans-serif;">
    <main
      style="max-width:560px;margin:32px auto;background:#ffffff;padding:36px;border-radius:12px;"
    >
      <p style="margin:0 0 24px;font-family:Georgia,serif;font-size:28px;color:#1f563d;">
        Salad Soulmates
      </p>
      <h1 style="margin:0 0 18px;font-size:26px;">You’re invited</h1>
      <p>Hi {{ .Data.display_name }},</p>
      <p>
        Your access to Salad Soulmates is ready. Use the secure link below to set your password and
        sign in.
      </p>
      <p style="margin:28px 0;">
        <a
          href="{{ .ConfirmationURL }}"
          style="display:inline-block;padding:12px 18px;background:#1f563d;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:700;"
          >Set up your account</a
        >
      </p>
      <p style="font-size:13px;color:#52665b;">
        If you were not expecting this invitation, you can safely ignore this email.
      </p>
    </main>
  </body>
</html>
```

Do not replace `{{ .ConfirmationURL }}` with a handcrafted URL. Verify the exact
Vercel callback URL is present in Supabase Auth's redirect allow-list, then test
the email in a disposable account before sending a real invitation.
