FROM jupyter/base-notebook:latest

# JupyterHub spawns this image as a single-user server, so it needs the
# matching jupyterhub package on PATH (provides jupyterhub-singleuser).
RUN pip install --no-cache-dir \
    jupyterhub==5.0.0 \
    jupyterlab

USER root
RUN mkdir -p /home/jovyan/work && chown -R jovyan:users /home/jovyan/work
USER jovyan

# DockerSpawner injects the right command and env vars at runtime.
