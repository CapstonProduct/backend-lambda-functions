### Lambda Layer 라이브러리 설치 커맨드
- pymysql은 하나만 설치해도 문제가 없으나,
- matplotlib의 경우 종속성이 있는 라이브러리를 함께 설치해야 해서 종류가 아래와 같이 많아짐.
- 람다 함수 운영체제와 동일한 linux 86_64로 설치함
- 디렉토리 구조 (경로 인식을 위해, python 디렉토리 내부에 반드시 설치해야 함)
- 설치시 --no-deps 옵션을 제거하면 자동으로 종속적인 라이브러리들이 설치됨.

layer-library-graph
|_python
  |_위의 라이브러리들
  |_fonts/NanumGothic.ttf
- 라이브러리 설치 커맨드
pip install pymysql matplotlib numpy packaging kiwisolver pyparsing cycler Pillow fonttools openai fpdf2 typing_extensions pydantic\
  --platform manylinux2014_x86_64 \
  --target ./ \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \
  --no-deps

pip install openai fpdf2 \
  --platform manylinux2014_x86_64 \
  --target ./ \
  --implementation cp \
  --python-version 3.11 \
  --only-binary=:all: \

- 폰트 추가 커맨드 (아래 경로에 원하는 폰트 파일을 넣기)
cp NanumGothic-Regular.ttf python/matplotlib/mpl-data/fonts/ttf/
- 라이브러리 압축 커맨드 실행 
zip -r layer-library-graph.zip python
zip -r layer-pydantic.zip python
- Lambda layer에 zip 업로드 > Lambda 함수에 Layer 추가

### 람다 함수 환경 변수 지정
람다 함수 > 구성 > 환경 변수
DB_HOST, DB_NAME, DB_PASSWORD, DB_USER, S3_BUCKET_GRAPH, S3_BUCKET_PDF, OPENAI_API_KEY 생성

### S3 버킷 생성
- fitbit-graph-s3-bucket 버킷 생성
- 버킷 안에 graphs 폴더 생성

- fitbit-report-s3-bucket 버킷 생성
- 버킷 안에 healthreport 폴더 생성
- 버킷 안에 fonts 폴더 생성 & 내부에 NanumGothic-Regular.ttf 업로드

### S3 연결 권한 설정
람다 함수 > 구성 > 권한 > 실행 역할 > 
역할 이름 파란 링크 클릭 > IAM 역할 페이지로 이동 >
권한 추가 > 인라인 정책 생성 > JSON에 아래 내용 추가

{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:PutObjectAcl"
      ],
      "Resource": "arn:aws:s3:::fitbit-graph-s3-bucket/*"
    }
  ]
}

{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Action": [
				"s3:PutObject",
				"s3:PutObjectAcl"
			],
			"Resource": "arn:aws:s3:::fitbit-report-s3-bucket/*"
		}
	]
}