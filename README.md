# Pocket Billiards Mobile

모바일 Safari에서 URL만 열어도 바로 플레이 가능한 정적 포켓볼 게임입니다.

https://soonhakahn.github.io/pocket-billiards-mobile/

## 특징

- HTML5 Canvas 기반 포켓볼 게임
- 터치 드래그 조준 + 파워 샷
- Web Audio API 기반 배경음악, 효과음, 반응형 시각화
- GitHub Pages에 바로 배포 가능한 정적 구조

## 로컬 실행

정적 파일이라서 아무 웹서버로 열면 됩니다.

```bash
python3 -m http.server 4173
```

그 다음 `http://localhost:4173` 또는 폴더 경로에 맞는 URL로 접속하세요.

## GitHub Pages 배포

리포지토리 루트에 이 파일들을 두고 GitHub Pages source를 `main` 브랜치 `/root`로 설정하면 됩니다.
