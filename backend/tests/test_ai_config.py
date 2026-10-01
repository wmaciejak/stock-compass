from pathlib import Path
from uuid import uuid4
import pytest
from pydantic import ValidationError


def config_module():
    assert (Path(__file__).parents[1] / 'compass/ai/config.py').is_file(), 'AI configuration is not implemented'
    from compass.ai.config import load_ai_config
    return load_ai_config


@pytest.fixture(autouse=True)
def clean_ai_env(monkeypatch):
    import os
    for key in list(os.environ):
        if key.startswith('STOCK_COMPASS_AI_') or key == 'OPENAI_API_KEY':
            monkeypatch.delenv(key)


def test_ai_is_optional_and_cost_sensitive_model_is_default():
    config = config_module()(offline=False)
    assert not config.enabled
    assert config.model == 'gpt-6-luna'
    from compass.ai.config import AiConfig
    assert AiConfig(False,'ai_disabled').model == config.model
    assert config.public_status()['reason'] == 'ai_disabled'


def test_offline_disables_ai_without_exposing_key(monkeypatch):
    monkeypatch.setenv('OPENAI_API_KEY', 'test-secret')
    monkeypatch.setenv('STOCK_COMPASS_AI_ENABLED', '1')
    config = config_module()(offline=True)
    assert not config.enabled
    assert config.disabled_reason == 'ai_offline'
    assert 'test-secret' not in str(config.public_status())
    assert 'test-secret' not in repr(config)


def test_missing_key_and_explicit_enablement(monkeypatch):
    monkeypatch.setenv('STOCK_COMPASS_AI_ENABLED', '1')
    assert config_module()(offline=False).disabled_reason == 'missing_key'
    monkeypatch.setenv('OPENAI_API_KEY', 'test-secret')
    config = config_module()(offline=False)
    assert config.enabled
    assert config.timeout_seconds == 240
    assert config.max_output_tokens == 12000


@pytest.mark.parametrize('key,value', [('REASONING','none'), ('TIMEOUT_SECONDS','0'), ('MAX_CONTEXT_BYTES','0'), ('MAX_OUTPUT_TOKENS','999999'), ('MAX_REQUEST_TOKENS','0'), ('MAX_REQUEST_TOKENS','12000')])
def test_invalid_configuration_is_explicit(monkeypatch, key, value):
    monkeypatch.setenv('STOCK_COMPASS_AI_'+key,value)
    with pytest.raises(ValueError):
        config_module()(offline=False)


def test_typed_browser_context_preserves_clear_and_rejects_overrides():
    assert (Path(__file__).parents[1] / 'compass/ai/models.py').is_file(), 'AI contracts are not implemented'
    from compass.ai.models import BrowserContext, AiSummaryRequest
    assert BrowserContext().note_draft is None
    assert BrowserContext(note_draft='').note_draft == ''
    with pytest.raises(ValidationError):
        BrowserContext(sizing_form={'secret':'bad'})
    with pytest.raises(ValidationError):
        AiSummaryRequest(client_request_id=uuid4(), horizon='2–8 weeks', language='en', mode='demo', model='override')
