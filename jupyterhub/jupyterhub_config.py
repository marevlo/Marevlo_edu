import os
import sys

sys.path.insert(0, "/srv/jupyterhub")
from marevlo_authenticator import MarevloAuthenticator  # noqa: E402

c = get_config()  # type: ignore  # noqa: F821 (provided by jupyterhub at runtime)

# Hub binding
c.JupyterHub.bind_url = "http://0.0.0.0:8000"
c.JupyterHub.hub_ip = "0.0.0.0"
c.JupyterHub.hub_connect_ip = os.environ.get("HUB_CONNECT_IP", "jupyterhub")

# Authenticator
c.JupyterHub.authenticator_class = MarevloAuthenticator
c.Authenticator.allow_all = True  # JWT validation already gates access

# Spawner: per-user Docker containers
c.JupyterHub.spawner_class = "dockerspawner.DockerSpawner"
c.DockerSpawner.image = os.environ.get(
    "NOTEBOOK_USER_IMAGE", "marevlo-notebook-user:latest"
)
c.DockerSpawner.network_name = os.environ.get(
    "DOCKER_NETWORK_NAME", "marevlo_jupyterhub_network"
)
c.DockerSpawner.use_internal_ip = True
c.DockerSpawner.remove = True  # remove container on stop; volume keeps the data
c.DockerSpawner.notebook_dir = "/home/jovyan/work"
c.DockerSpawner.volumes = {
    "jupyterhub-user-{username}": "/home/jovyan/work",
}

# Resource limits per user container
c.DockerSpawner.cpu_limit = 1.0
c.DockerSpawner.mem_limit = "1G"

# Idle culling: shut down inactive user servers after 1 hour
c.JupyterHub.services = [
    {
        "name": "idle-culler",
        "command": [
            "python",
            "-m",
            "jupyterhub_idle_culler",
            "--timeout=3600",
        ],
    },
]
c.JupyterHub.load_roles = [
    {
        "name": "idle-culler-role",
        "scopes": [
            "list:users",
            "read:users:activity",
            "read:servers",
            "delete:servers",
        ],
        "services": ["idle-culler"],
    }
]

# Persistent state: SQLite + cookie secret on a host-mounted volume
c.JupyterHub.db_url = "sqlite:////srv/jupyterhub/data/jupyterhub.sqlite"
c.JupyterHub.cookie_secret_file = "/srv/jupyterhub/data/jupyterhub_cookie_secret"
