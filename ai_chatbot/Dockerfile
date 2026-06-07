FROM python:3.10

WORKDIR /app

RUN pip install fastapi uvicorn paddleocr opencv-python

COPY . .

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8001"]