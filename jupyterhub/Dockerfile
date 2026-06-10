FROM jupyterhub/jupyterhub:5.0

COPY requirements.txt /tmp/requirements.txt
RUN pip install --no-cache-dir -r /tmp/requirements.txt

COPY marevlo_authenticator.py /srv/jupyterhub/marevlo_authenticator.py
COPY jupyterhub_config.py /srv/jupyterhub/jupyterhub_config.py

RUN mkdir -p /srv/jupyterhub/data

WORKDIR /srv/jupyterhub
ENV PYTHONPATH=/srv/jupyterhub

CMD ["jupyterhub", "-f", "/srv/jupyterhub/jupyterhub_config.py"]
