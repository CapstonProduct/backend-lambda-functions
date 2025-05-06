import os
os.environ['MPLCONFIGDIR'] = '/tmp'
import pymysql
import matplotlib.pyplot as plt
import boto3
from io import BytesIO
import matplotlib
import matplotlib.dates as mdates
from datetime import datetime, timedelta
from fpdf import FPDF
from openai import OpenAI


openai_client = OpenAI(api_key=os.environ["OPENAI_API_KEY"])

DB_HOST = os.environ["DB_HOST"]
DB_USER = os.environ["DB_USER"]
DB_PASSWORD = os.environ["DB_PASSWORD"]
DB_NAME = os.environ["DB_NAME"]
S3_BUCKET_GRAPH = os.environ["S3_BUCKET_GRAPH"]
S3_BUCKET_PDF = os.environ["S3_BUCKET_PDF"]


def wrap_text(text, max_length=55):
    import textwrap
    wrapped = []
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if paragraph:
            wrapped += textwrap.wrap(
                paragraph,
                width=max_length,
                break_long_words=True,
                replace_whitespace=False
            )
        else:
            wrapped.append('') 
    return '\n'.join(wrapped)


def remove_unsupported_chars(text):
    return ''.join(c for c in text if 32 <= ord(c) <= 126 or ord(c) >= 0xAC00)


def fetch_fitbit_data(query):
    conn = pymysql.connect(
        host=DB_HOST,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        cursorclass=pymysql.cursors.DictCursor
    )
    try:
        with conn.cursor() as cursor:
            cursor.execute(query)
            data = cursor.fetchall()
        return data
    finally:
        conn.close()


def upload_to_s3(img_buffer, filename, bucket):
    s3 = boto3.client('s3')
    s3.put_object(Bucket=bucket, Key=filename, Body=img_buffer, ContentType='image/png')
    return f"https://{bucket}.s3.amazonaws.com/{filename}"


def upload_pdf_to_s3(pdf_buffer, username, today):
    today = datetime.now().strftime('%Y-%m-%d')
    file_name = f"healthreport/건강리포트_{today}_{username}.pdf"
    s3 = boto3.client('s3')
    s3.put_object(Bucket=S3_BUCKET_PDF, Key=file_name, Body=pdf_buffer, ContentType='application/pdf')
    return f"https://{S3_BUCKET_PDF}.s3.amazonaws.com/{file_name}"


def generate_sleep_step_graph_week(data):
    data = sorted(data, key=lambda x: x['created_at'])
    timestamps = [datetime.strptime(d['created_at'], "%Y-%m-%d %H:%M:%S") if isinstance(d['created_at'], str) else d['created_at'] for d in data]
    
    deep_list = [d['deep_sleep_hours'] for d in data]
    light_list = [d['light_sleep_hours'] for d in data]
    rem_list = [d['rem_sleep_hours'] for d in data]
    awake_list = [d['awake_hours'] for d in data]

    pastel_colors = {'deep': '#A0C4FF', 'light': '#BDB2FF', 'rem': '#FFC6FF', 'awake': '#FFD6A5'}
    bar_width = timedelta(minutes=100)
    plt.figure(figsize=(14, 7))

    plt.bar(timestamps, deep_list, label='깊은 수면', color=pastel_colors['deep'], width=bar_width)
    plt.bar(timestamps, light_list, bottom=deep_list, label='얕은 수면', color=pastel_colors['light'], width=bar_width)
    plt.bar(timestamps, rem_list, bottom=[d + l for d, l in zip(deep_list, light_list)], label='렘 수면', color=pastel_colors['rem'], width=bar_width)
    plt.bar(timestamps, awake_list, bottom=[d + l + r for d, l, r in zip(deep_list, light_list, rem_list)], label='깨어있는 시간', color=pastel_colors['awake'], width=bar_width)
    
    plt.xlabel('시각', fontsize=12)
    plt.ylabel('수면 시간\n(시간)', fontsize=12, rotation=0, labelpad=50)
    plt.title('일주일간 수면 단계 분포', fontweight='bold', fontsize=15)
    ax = plt.gca()
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%Y-%m-%d\n%H:%M'))
    plt.legend()
    plt.tight_layout()

    img_buffer = BytesIO()
    plt.savefig(img_buffer, format='png')
    img_buffer.seek(0)
    plt.close()
    return img_buffer


def generate_heart_rate(data):
    created_at = [d['created_at'] for d in data]
    heart_rate = [d['heart_rate'] for d in data]

    plt.figure(figsize=(10, 5))
    plt.plot(created_at, heart_rate, marker='o', label='심박수', color='#0ABAB5')
    plt.xlabel('시간')
    plt.ylabel('평균 심박수\n(bpm)', rotation=0, labelpad=40)
    plt.title('일일 평균 심박수 변화')
    plt.legend()

    ax = plt.gca()
    ax.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.tight_layout()

    img_buffer = BytesIO()
    plt.savefig(img_buffer, format='png')
    img_buffer.seek(0)
    plt.close()
    return img_buffer


def generate_step_and_calories_graph(data):
    created_at = [d['created_at'] for d in data]
    steps = [d['steps'] for d in data]
    calories = [d['calories_total'] for d in data]

    fig, ax1 = plt.subplots(figsize=(10, 5))
    ax1.plot(created_at, steps, marker='o', linestyle='dashed', color='#FFB3A7', label='걸음 수')
    ax1.set_ylabel('걸음 수', rotation=0, labelpad=40)
    ax2 = ax1.twinx()
    ax2.plot(created_at, calories, marker='s', color='#A5C8FF', label='칼로리 소모')
    ax2.set_ylabel('칼로리\n소모', rotation=0, labelpad=40)
    ax1.set_xlabel('시간')
    ax1.xaxis.set_major_locator(mdates.AutoDateLocator())
    ax1.xaxis.set_major_formatter(mdates.DateFormatter('%H:%M'))
    plt.tight_layout()

    img_buffer = BytesIO()
    plt.savefig(img_buffer, format='png')
    img_buffer.seek(0)
    plt.close()
    return img_buffer


def generate_gpt_analysis(prompt):
    response = openai_client.chat.completions.create(
        model="gpt-4",
        messages=[
            {
                "role": "system",
                "content": (
                    "당신은 친절한 건강 데이터 분석가입니다. "
                    "사용자의 활동 및 수면 데이터를 분석하여 통찰을 제공합니다. "
                    "분석 결과는 자연스러운 문장으로 구성해주세요."
                )
            },
            {"role": "user", "content": prompt}
        ],
        temperature=0.7
    )
    return response.choices[0].message.content


def format_activity_data(data):
    return "[활동 데이터]\n" + "\n".join([f"{d['created_at']}, 심박수: {d['heart_rate']}, 걸음: {d['steps']}, 칼로리: {d['calories_total']}" for d in data])


def format_sleep_data(data):
    return "[수면 데이터]\n" + "\n".join([f"{d['created_at']}, 깊은 수면: {d['deep_sleep_hours']}, 얕은 수면: {d['light_sleep_hours']}, 렘 수면: {d['rem_sleep_hours']}, 깨어있음: {d['awake_hours']}" for d in data])


def generate_pdf_report(activity_analysis, sleep_analysis, img1, img2, img3, username):
    pdf = FPDF()
    pdf.add_page()
    pdf.add_font("Nanum", "", "/tmp/NanumGothic-Regular.ttf", uni=True)
    pdf.set_font("Nanum", size=12)

    today_str = datetime.now().strftime('%Y-%m-%d')

    pdf.set_font("Nanum", size=20)
    pdf.set_text_color(33, 33, 33)
    pdf.cell(0, 15, f"{username}님의 건강 리포트 - {today_str}", ln=True, align='C')
    pdf.ln(5)

    pdf.set_font("Nanum", size=14)
    pdf.set_text_color(0, 102, 204)
    pdf.cell(0, 10, "활동 분석", ln=True)
    pdf.set_draw_color(0, 102, 204)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    pdf.set_font("Nanum", size=12)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 8, wrap_text(activity_analysis, 80))
    pdf.ln(4)
    pdf.image(img1, x=15, w=180)
    pdf.ln(5)
    pdf.image(img2, x=15, w=180)
    pdf.ln(10)

    pdf.set_font("Nanum", size=14)
    pdf.set_text_color(102, 0, 153)
    pdf.cell(0, 10, "수면 분석", ln=True)
    pdf.set_draw_color(102, 0, 153)
    pdf.set_line_width(0.5)
    pdf.line(10, pdf.get_y(), 200, pdf.get_y())
    pdf.ln(3)

    pdf.set_font("Nanum", size=12)
    pdf.set_text_color(0, 0, 0)
    pdf.multi_cell(0, 8, wrap_text(sleep_analysis, 80))
    pdf.ln(4)
    pdf.image(img3, x=15, w=180)

    output_buffer = BytesIO()
    pdf.output(output_buffer)
    output_buffer.seek(0)
    return output_buffer


def download_font_from_s3(bucket, key, local_path="/tmp/NanumGothic-Regular.ttf"):
    boto3.client("s3").download_file(bucket, key, local_path)


def lambda_handler(event, context):
    matplotlib.rcParams['font.family'] = 'NanumGothic'
    matplotlib.rcParams['axes.unicode_minus'] = False
    download_font_from_s3(S3_BUCKET_PDF, "fonts/NanumGothic-Regular.ttf")
    username = "최예름"
    today = datetime.now().strftime('%Y-%m-%d')
   
    sleep_data = fetch_fitbit_data("SELECT * FROM fitbit_sleep_data ORDER BY created_at DESC")
    activity_data = fetch_fitbit_data("SELECT * FROM fitbit_activity_data ORDER BY created_at DESC")
   
    sleep_graph = generate_sleep_step_graph_week(sleep_data)
    hr_graph = generate_heart_rate(activity_data)
    step_graph = generate_step_and_calories_graph(activity_data)
   
    sleep_graph_url = upload_to_s3(sleep_graph, f"graphs/{today}_sleep_step.png", S3_BUCKET_GRAPH)
    hr_graph_url = upload_to_s3(hr_graph, f"graphs/{today}_activity_heart_rate.png", S3_BUCKET_GRAPH)
    step_graph_url = upload_to_s3(step_graph, f"graphs/{today}_activity_step_calories.png", S3_BUCKET_GRAPH)
  
    activity_prompt = format_activity_data(activity_data)
    sleep_prompt = format_sleep_data(sleep_data)
  
    activity_analysis = wrap_text(remove_unsupported_chars(generate_gpt_analysis(activity_prompt)))
    sleep_analysis = wrap_text(remove_unsupported_chars(generate_gpt_analysis(sleep_prompt)))
   
    pdf_buffer = generate_pdf_report(activity_analysis, sleep_analysis, hr_graph, step_graph, sleep_graph, username)
    pdf_url = upload_pdf_to_s3(pdf_buffer, username, today)
    
    return {
        "statusCode": 200,
        "body": {
            "message": f"PDF 업로드 완료: {pdf_url}",
            "pdf_url": pdf_url,
            "image_urls": {
                "heart_rate_graph": hr_graph_url,
                "step_calories_graph": step_graph_url,
                "sleep_step_graph": sleep_graph_url
            }
        }
    }
