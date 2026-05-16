# Workers

Reserved entrypoint area for:
- watched-folder sync consumers;
- preview generation consumers;
- AI-analysis orchestration consumers.

The domain contracts already model the required flows; concrete queue runners can be added here without changing product boundaries.
