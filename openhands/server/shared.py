import os

from dotenv import load_dotenv

from openhands.core.config import load_app_config
from openhands.server.config.server_config import load_server_config
from openhands.server.conversation_manager.conversation_manager import (
    ConversationManager,
)
from openhands.server.monitoring import MonitoringListener
from openhands.storage import get_file_store
from openhands.storage.conversation.conversation_store import ConversationStore
from openhands.storage.settings.settings_store import SettingsStore
from openhands.utils.import_utils import get_impl

load_dotenv()

config = load_app_config()
server_config = load_server_config()
file_store = get_file_store(config.file_store, config.file_store_path)

# Communication setup
CUSTOM_DOMAIN = bool(os.environ.get("CUSTOM_DOMAIN_URL"))

# For frontend communication, we still need Socket.IO
import socketio
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins='*')

MonitoringListenerImpl = get_impl(
    MonitoringListener,
    server_config.monitoring_listener_class,
)

monitoring_listener = MonitoringListenerImpl.get_instance(config)

ConversationManagerImpl = get_impl(
    ConversationManager,  # type: ignore
    server_config.conversation_manager_class,
)

conversation_manager = ConversationManagerImpl.get_instance(  # type: ignore
    None, config, file_store, server_config, monitoring_listener
)

SettingsStoreImpl = get_impl(SettingsStore, server_config.settings_store_class)  # type: ignore

ConversationStoreImpl = get_impl(
    ConversationStore,  # type: ignore
    server_config.conversation_store_class,
)
