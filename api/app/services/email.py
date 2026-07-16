import smtplib
from email.message import EmailMessage

from app.core.settings import settings


def smtp_configured() -> bool:
    return bool(settings.smtp_user and settings.smtp_password)


def send_reset_email(to_email: str, reset_url: str) -> None:
    sender = settings.smtp_from or settings.smtp_user
    message = EmailMessage()
    message["Subject"] = "Recuperação de senha"
    message["From"] = sender
    message["To"] = to_email
    message.set_content(
        "\n".join(
            [
                "Recebemos uma solicitação para redefinir sua senha.",
                "",
                f"Acesse este link para criar uma nova senha: {reset_url}",
                "",
                f"Este link expira em {settings.password_reset_expires_minutes} minutos.",
                "Se você não pediu essa alteração, ignore este e-mail.",
            ]
        )
    )

    smtp_class = smtplib.SMTP_SSL if settings.smtp_use_ssl else smtplib.SMTP
    with smtp_class(settings.smtp_host, settings.smtp_port, timeout=20) as smtp:
        if settings.smtp_use_tls and not settings.smtp_use_ssl:
            smtp.starttls()
        smtp.login(settings.smtp_user, settings.smtp_password)
        smtp.send_message(message)
