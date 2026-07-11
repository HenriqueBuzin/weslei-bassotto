import hashlib
import hmac

from app.payments.mercado_pago import verify_webhook_signature


def test_validates_mercado_pago_signature():
    secret = "secret"
    manifest = "id:123;request-id:req-1;ts:1704908010;"
    digest = hmac.new(secret.encode(), manifest.encode(), hashlib.sha256).hexdigest()
    assert verify_webhook_signature(
        signature=f"ts=1704908010,v1={digest}", request_id="req-1", data_id="123", secret=secret
    )


def test_rejects_invalid_signature():
    assert not verify_webhook_signature(signature="ts=1,v1=bad", request_id="req", data_id="123", secret="secret")
