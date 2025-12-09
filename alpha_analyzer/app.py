from flask import Flask, render_template, request, jsonify
import re
from collections import Counter
import requests
import os
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import seaborn as sns
import matplotlib.pyplot as plt
from matplotlib.backends.backend_agg import FigureCanvasAgg as FigureCanvas
from io import BytesIO
import base64
import numpy as np
import pandas as pd
from datetime import datetime, timedelta, timezone
import pytz
import matplotlib.gridspec as gridspec  # 添加缺失的gridspec导入

app = Flask(__name__)

# 运算符列表
ops = ['abs', 'add', 'ceiling', 'divide', 'exp', 'floor', 'fraction', 'inverse', 'log', 'log_diff', 'max', 'min',
       'multiply', 'nan_mask', 'nan_out', 'power', 'purify', 'replace', 'reverse', 'round', 'round_down', 'sign',
       'signed_power', 's_log_1p', 'sqrt', 'subtract', 'to_nan', 'densify', 'and', 'or', 'equal', 'negate', 'less',
       'if_else', 'is_not_nan', 'is_nan', 'is_finite', 'is_not_finite', 'days_from_last_change', 'ts_weighted_decay',
       'ts_weighted_delay', 'hump', 'hump_decay', 'inst_tvr', 'jump_decay', 'kth_element', 'last_diff_value',
       'ts_arg_max', 'ts_arg_min', 'ts_av_diff', 'ts_backfill', 'ts_co_kurtosis', 'ts_corr', 'ts_co_skewness',
       'ts_count_nans', 'ts_covariance', 'ts_decay_exp_window', 'ts_decay_linear', 'ts_delay', 'ts_delta', 'ts_ir',
       'ts_kurtosis', 'ts_max', 'ts_max_diff', 'ts_mean', 'ts_median', 'ts_min', 'ts_min_diff', 'ts_min_max_cps',
       'ts_min_max_diff', 'ts_moment', 'ts_partial_corr', 'ts_percentage', 'ts_poly_regression', 'ts_product',
       'ts_rank', 'ts_regression', 'ts_returns', 'ts_scale', 'ts_skewness', 'ts_std_dev', 'ts_step', 'ts_sum',
       'ts_theilsen', 'ts_triple_corr', 'ts_zscore', 'ts_entropy', 'ts_vector_neut', 'ts_vector_proj',
       'ts_rank_gmean_amean_diff', 'ts_quantile', 'normalize', 'one_side', 'quantile', 'rank', 'rank_by_side',
       'generalized_rank', 'regression_neut', 'regression_proj', 'scale', 'scale_down', 'truncate', 'vector_neut',
       'vector_proj', 'winsorize', 'zscore', 'rank_gmean_amean_diff', 'vec_avg', 'vec_choose', 'vec_count', 'vec_ir',
       'vec_kurtosis', 'vec_max', 'vec_min', 'vec_norm', 'vec_percentage', 'vec_powersum', 'vec_range', 'vec_skewness',
       'vec_stddev', 'vec_sum', 'arc_cos', 'arc_sin', 'arc_tan', 'bucket', 'clamp', 'filter', 'keep', 'left_tail',
       'pasteurize', 'right_tail', 'sigmoid', 'tail', 'tanh', 'trade_when', 'group_sum', 'group_vector_proj',
       'group_vector_neut', 'group_extra', 'group_scale', 'group_percentage', 'group_normalize', 'group_neutralize',
       'group_max', 'group_count', 'group_rank', 'group_zscore', 'group_std_dev', 'group_min', 'group_median',
       'group_mean', 'group_coalesce', 'group_backfill', 'convert', 'inst_pnl', 'ts_delta_limit',
       'ts_target_tvr_delta_limit', 'ts_target_tvr_hump', 'vec_filter', 'group_cartesian_product']


def create_session_with_retries():
    """创建带重试机制的会话"""
    session = requests.Session()
    retry_strategy = Retry(
        total=3,  # 最大重试次数
        status_forcelist=[429, 500, 502, 503, 504],  # 需要重试的状态码
        allowed_methods=["GET", "POST"],  # 允许重试的HTTP方法
        backoff_factor=1  # 重试间隔
    )
    adapter = HTTPAdapter(max_retries=retry_strategy)
    session.mount("https://", adapter)
    return session


def login():
    username = ""
    password = ""

    # 创建会话时禁用代理
    s = requests.Session()
    s.trust_env = False  # 忽略系统代理设置
    s.proxies = {"http": None, "https": None}  # 显式禁用代理

    # 保存凭证
    s.auth = (username, password)

    # 发送认证请求
    try:
        response = s.post('https://api.worldquantbrain.com/authentication')
        print(f"认证状态码: {response.status_code}")
        print(f"响应内容: {response.text[:200]}...")  # 只打印前200字符
        if response.status_code in [200, 201]:
            return s
        else:
            print(f"认证失败: HTTP {response.status_code}")
            return None
    except requests.exceptions.RequestException as e:
        print(f"连接失败: {str(e)}")
        # 添加详细的错误处理
        if isinstance(e, requests.exceptions.ProxyError):
            print("代理错误: 请检查网络代理设置或尝试直接连接")
        elif isinstance(e, requests.exceptions.ConnectionError):
            print("连接错误: 无法访问API服务器，请检查网络连接")
        return None


def extract_operators(expression, operators_list):
    """从表达式中提取运算符"""
    ops_pattern = r"\b(" + "|".join(operators_list) + r")\b"
    return re.findall(ops_pattern, expression)


def analyze_alpha_expressions(expressions):
    """分析表达式中的运算符使用情况"""
    operator_counter = Counter()
    for expr in expressions:
        operators_used = extract_operators(expr, ops)
        operator_counter.update(operators_used)
    return operator_counter


def get_submitted_alphas_exp(year, start_month_day, end_month_day, alpha_num):
    """获取提交的Alpha表达式"""
    s = login()
    if not s:
        return [], "登录失败"

    count = 0
    expressions = []
    error_count = 0

    try:
        alpha_num = int(alpha_num)
    except ValueError:
        return [], "alpha_num参数必须是整数"

    for offset in range(0, alpha_num, 100):
        try:
            url = (f"https://api.worldquantbrain.com/users/self/alphas?"
                   f"limit=100&offset={offset}&status=ACTIVE%1FIS_FAIL&"
                   f"dateCreated%3E={year}-{start_month_day}T00:00:00-04:00&"
                   f"dateCreated%3C={year}-{end_month_day}T00:00:00-04:00&"
                   "order=-is.sharpe&hidden=false&type!=SUPER")

            response = s.get(url, timeout=10)

            if response.status_code != 200:
                print(f"请求失败: HTTP {response.status_code}")
                error_count += 1
                if error_count > 3:
                    break
                continue

            error_count = 0
            alpha_list = response.json().get("results", [])
            for alpha in alpha_list:
                settings = alpha.get("settings", {})
                is_data = alpha.get("is", {})
                oos_data = alpha.get("oos", {})

                region = settings.get("region", "Unknown")
                sharpe = is_data.get("sharpe", 0)
                fitness = is_data.get("fitness", 0)
                turnover = is_data.get("turnover", 0)
                returns = is_data.get("returns", 0)
                margin = is_data.get("margin", 0)
                drawdown = is_data.get("drawdown", 0)
                prod_corr = is_data.get("prodCorrelation", 0)

                os_is_ratio = 0
                if sharpe != 0:
                    os_is_ratio = oos_data.get("sharpe", 0) / sharpe

                regular_field = alpha.get("regular", {})
                if isinstance(regular_field, dict):
                    code = regular_field.get("code", "")
                else:
                    code = regular_field

                expressions.append({
                    "id": alpha.get("id", ""),
                    "code": code,
                    "region": region,
                    "sharpe": sharpe,
                    "fitness": fitness,
                    "turnover": turnover,
                    "returns": returns,
                    "margin": margin,
                    "drawdown": drawdown,
                    "prod_corr": prod_corr,
                    "os_is_ratio": os_is_ratio,
                    "created": alpha.get("dateCreated", "")
                })
                count += 1

        except Exception as e:
            print(f"请求异常: {str(e)}")
            error_count += 1
            if error_count > 3:
                break

    message = f"获取到 {count} 个Alpha表达式"
    if error_count > 0:
        message += f" (遇到 {error_count} 个错误)"

    return expressions, message


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/get_alphas', methods=['POST'])
def get_alphas():
    data = request.json
    try:
        # 确保所有参数都是正确的类型
        year = int(data.get('year', 2025))
        start_date = data.get('start_date', '01-01')
        end_date = data.get('end_date', '12-31')
        alpha_num = int(data.get('alpha_num', 600))

        expressions, message = get_submitted_alphas_exp(year, start_date, end_date, alpha_num)

        if not expressions:
            return jsonify({"success": False, "message": message})

        # 运算符统计
        codes = [expr['code'] for expr in expressions]
        operator_counts = analyze_alpha_expressions(codes)

        # 按使用频率排序
        sorted_ops = sorted(operator_counts.items(), key=lambda x: x[1], reverse=True)

        # 计算OS/IS Ratio统计
        os_is_ratios = [expr['os_is_ratio'] for expr in expressions if expr['os_is_ratio'] is not None]
        os_is_stats = {
            "min": min(os_is_ratios) if os_is_ratios else 0,
            "max": max(os_is_ratios) if os_is_ratios else 0,
            "avg": sum(os_is_ratios) / len(os_is_ratios) if os_is_ratios else 0,
            "count": len([r for r in os_is_ratios if r > 0.7])  # 统计OS/IS > 0.7的数量
        }

        # 计算Prod-correlation统计
        prod_corrs = [expr['prod_corr'] for expr in expressions if expr['prod_corr'] is not None]
        prod_corr_stats = {
            "min": min(prod_corrs) if prod_corrs else 0,
            "max": max(prod_corrs) if prod_corrs else 0,
            "avg": sum(prod_corrs) / len(prod_corrs) if prod_corrs else 0
        }

        return jsonify({
            "success": True,
            "message": message,
            "expressions": expressions,
            "operator_counts": sorted_ops,
            "total_ops": sum(operator_counts.values()),
            "top_op": sorted_ops[0][0] if sorted_ops else "",
            "os_is_stats": os_is_stats,
            "prod_corr_stats": prod_corr_stats  # 新增Prod-correlation统计
        })

    except ValueError as e:
        return jsonify({
            "success": False,
            "message": f"参数类型错误: {str(e)}"
        })
    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"服务器错误: {str(e)}"
        })


@app.route('/search', methods=['POST'])
def search():
    data = request.json
    expressions = data.get('expressions', [])
    keyword = data.get('keyword', '').strip()

    if not keyword:
        return jsonify({"success": False, "message": "请输入搜索关键词"})

    results = []
    for expr in expressions:
        if keyword.lower() in expr['code'].lower():
            results.append(expr)

    return jsonify({
        "success": True,
        "count": len(results),
        "results": results
    })


# 新增函数：获取指定月份的数据
def get_month(alpha_list_submitted, month, year="2025"):
    """
    根据传入的月份过滤数据

    参数:
        alpha_list_submitted (list): Alpha表达式列表
        month (str): 月份字符串，格式为"MM"
        year (str): 年份，默认为"2025"

    返回:
        list: 过滤后的Alpha表达式列表
    """
    filtered = []
    for alpha in alpha_list_submitted:
        created = alpha.get("created", "")
        if created.startswith(f"{year}-{month}"):
            filtered.append(alpha)
    return filtered


# 新增函数：获取性能指标
def get_performance_metrics(alpha_list):
    """
    从Alpha列表中提取性能指标
    修改后增加了drawdown
    """
    sharpe_list = []
    turnover_list = []
    returns_list = []
    drawdown_list = []  # 新增
    margin_list = []
    fitness_list = []
    os_is_ratio_list = []
    prod_corr_list = []

    for alpha in alpha_list:
        sharpe_list.append(alpha.get("sharpe", 0))
        turnover_list.append(alpha.get("turnover", 0))
        returns_list.append(alpha.get("returns", 0))
        drawdown_list.append(alpha.get("drawdown", 0))  # 新增
        margin_list.append(alpha.get("margin", 0))
        fitness_list.append(alpha.get("fitness", 0))
        os_is_ratio_list.append(alpha.get("os_is_ratio", 0))
        prod_corr_list.append(alpha.get("prod_corr", 0))

    return (
        sharpe_list,
        turnover_list,
        returns_list,
        drawdown_list,  # 新增
        margin_list,
        fitness_list,
        os_is_ratio_list,
        prod_corr_list
    )


# 新增函数：生成月份对比图表
def generate_month_comparison_plot(month1, month2, data1, data2, title_prefix):
    """生成对比图表，修改后增加了三列"""
    (sharpe1, turnover1, returns1, drawdown1, margin1,
     fitness1, os_is_ratio1, prod_corr1) = data1
    (sharpe2, turnover2, returns2, drawdown2, margin2,
     fitness2, os_is_ratio2, prod_corr2) = data2

    fig = plt.figure(figsize=(15, 20))  # 增加高度以容纳更多图表
    gs = gridspec.GridSpec(5, 2, height_ratios=[1, 1, 1, 1, 1.5], width_ratios=[1, 1])

    # 更新图表布局，增加三列
    ax0 = fig.add_subplot(gs[0, 0])
    ax1 = fig.add_subplot(gs[0, 1])
    ax2 = fig.add_subplot(gs[1, 0])
    ax3 = fig.add_subplot(gs[1, 1])
    ax4 = fig.add_subplot(gs[2, 0])
    ax5 = fig.add_subplot(gs[2, 1])
    ax6 = fig.add_subplot(gs[3, 0])  # 新增 Returns
    ax7 = fig.add_subplot(gs[3, 1])  # 新增 Drawdown
    ax8 = fig.add_subplot(gs[4, 0])  # 新增 Margin
    ax9 = fig.add_subplot(gs[4, 1])  # 表格位置调整

    fig.suptitle(f'{title_prefix} Performance Comparison: Month {month1} vs Month {month2}', fontsize=16)

    # Sharpe Ratio
    sns.histplot(sharpe1, bins=20, kde=True, ax=ax0, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(sharpe2, bins=20, kde=True, ax=ax0, color='red', alpha=0.6, label=f'Month {month2}')
    ax0.set_title('Sharpe Ratio Distribution')
    ax0.legend()

    # Turnover
    sns.histplot(turnover1, bins=20, kde=True, ax=ax1, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(turnover2, bins=20, kde=True, ax=ax1, color='red', alpha=0.6, label=f'Month {month2}')
    ax1.set_title('Turnover Distribution')
    ax1.legend()

    # OS/IS Ratio
    sns.histplot(os_is_ratio1, bins=20, kde=True, ax=ax2, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(os_is_ratio2, bins=20, kde=True, ax=ax2, color='red', alpha=0.6, label=f'Month {month2}')
    ax2.set_title('OS/IS Ratio Distribution')
    ax2.legend()

    # Fitness
    sns.histplot(fitness1, bins=20, kde=True, ax=ax3, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(fitness2, bins=20, kde=True, ax=ax3, color='red', alpha=0.6, label=f'Month {month2}')
    ax3.set_title('Fitness Distribution')
    ax3.legend()

    # Prod-correlation
    sns.histplot(prod_corr1, bins=20, kde=True, ax=ax4, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(prod_corr2, bins=20, kde=True, ax=ax4, color='red', alpha=0.6, label=f'Month {month2}')
    ax4.set_title('Prod-correlation Distribution')
    ax4.legend()

    # 新增 Returns
    sns.histplot(returns1, bins=20, kde=True, ax=ax5, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(returns2, bins=20, kde=True, ax=ax5, color='red', alpha=0.6, label=f'Month {month2}')
    ax5.set_title('Returns Distribution')
    ax5.legend()

    # 新增 Drawdown
    sns.histplot(drawdown1, bins=20, kde=True, ax=ax6, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(drawdown2, bins=20, kde=True, ax=ax6, color='red', alpha=0.6, label=f'Month {month2}')
    ax6.set_title('Drawdown Distribution')
    ax6.legend()

    # 新增 Margin
    sns.histplot(margin1, bins=20, kde=True, ax=ax7, color='blue', alpha=0.6, label=f'Month {month1}')
    sns.histplot(margin2, bins=20, kde=True, ax=ax7, color='red', alpha=0.6, label=f'Month {month2}')
    ax7.set_title('Margin Distribution')
    ax7.legend()

    # 表格
    comparison_data = {
        'Metric': ['Sharpe', 'Turnover', 'OS/IS Ratio', 'Fitness', 'Prod-correlation', 'Returns', 'Drawdown', 'Margin'],
        f'Month {month1}': [
            sum(sharpe1) / len(sharpe1) if sharpe1 else 0,
            sum(turnover1) / len(turnover1) if turnover1 else 0,
            sum(os_is_ratio1) / len(os_is_ratio1) if os_is_ratio1 else 0,
            sum(fitness1) / len(fitness1) if fitness1 else 0,
            sum(prod_corr1) / len(prod_corr1) if prod_corr1 else 0,
            sum(returns1) / len(returns1) if returns1 else 0,  # 新增
            sum(drawdown1) / len(drawdown1) if drawdown1 else 0,  # 新增
            sum(margin1) / len(margin1) if margin1 else 0  # 新增
        ],
        f'Month {month2}': [
            sum(sharpe2) / len(sharpe2) if sharpe2 else 0,
            sum(turnover2) / len(turnover2) if turnover2 else 0,
            sum(os_is_ratio2) / len(os_is_ratio2) if os_is_ratio2 else 0,
            sum(fitness2) / len(fitness2) if fitness2 else 0,
            sum(prod_corr2) / len(prod_corr2) if prod_corr2 else 0,
            sum(returns2) / len(returns2) if returns2 else 0,  # 新增
            sum(drawdown2) / len(drawdown2) if drawdown2 else 0,  # 新增
            sum(margin2) / len(margin2) if margin2 else 0  # 新增
        ]
    }

    # 创建对比表格
    ax9.axis('off')
    table_data = []
    for i in range(len(comparison_data['Metric'])):
        row = [
            comparison_data['Metric'][i],
            round(comparison_data[f'Month {month1}'][i], 3),
            round(comparison_data[f'Month {month2}'][i], 3)
        ]
        table_data.append(row)

    table = ax9.table(
        cellText=table_data,
        colLabels=['Metric', f'Month {month1}', f'Month {month2}'],
        cellLoc='center',
        loc='center'
    )
    table.auto_set_font_size(False)
    table.set_fontsize(8)
    table.scale(1, 1.5)
    ax9.set_title('Performance Metrics Comparison')

    plt.tight_layout()
    plt.subplots_adjust(top=0.95)

    # 将图表转换为base64编码
    buf = BytesIO()
    plt.savefig(buf, format='png')
    buf.seek(0)
    image_base64 = base64.b64encode(buf.read()).decode('utf-8')
    plt.close()

    return image_base64


# 新增路由：月份对比分析（支持自定义月份）
@app.route('/month_comparison', methods=['POST'])
def month_comparison():
    data = request.json
    expressions = data.get('expressions', [])
    month1 = data.get('month1', '01')
    month2 = data.get('month2', '02')
    analysis_type = data.get('type', 'is')  # 'is' 或 'os'

    # 检查是否选择了相同的月份
    if month1 == month2:
        return jsonify({'success': False, 'message': '请选择两个不同的月份进行对比'})

    # 获取两个月份的数据
    df_month1 = get_month(expressions, month1)
    df_month2 = get_month(expressions, month2)

    # 获取性能指标
    data1 = get_performance_metrics(df_month1)
    data2 = get_performance_metrics(df_month2)

    # 生成对比图表
    title_prefix = 'IS' if analysis_type == 'is' else 'OS'
    image_base64 = generate_month_comparison_plot(month1, month2, data1, data2, title_prefix)

    return jsonify({
        'success': True,
        'month1': month1,
        'month2': month2,
        'image': image_base64,
        'count1': len(df_month1),
        'count2': len(df_month2)
    })


# 新增函数：计算Prod-correlation统计
def calculate_prod_correlation_stats(expressions):
    """
    计算Prod-correlation的统计信息

    参数:
        expressions (list): Alpha表达式列表

    返回:
        dict: 包含总Prod、月Prod和14天Prod的统计信息
    """
    if not expressions:
        return {
            "total_prod": 0,
            "monthly_prod": {},
            "fourteen_day_prod": 0
        }

    # 计算总Prod
    total_prod = sum(expr.get("prod_corr", 0) for expr in expressions) / len(expressions)

    # 计算月Prod
    monthly_prod = {}
    months = set()
    for expr in expressions:
        created = expr.get("created", "")
        if created:
            month = created[:7]  # 格式: YYYY-MM
            months.add(month)

    for month in months:
        month_exprs = [expr for expr in expressions if expr.get("created", "").startswith(month)]
        if month_exprs:
            monthly_prod[month] = sum(expr.get("prod_corr", 0) for expr in month_exprs) / len(month_exprs)

    # 计算14天Prod - 修复时区问题
    utc = pytz.UTC  # 使用UTC时区
    today = datetime.now(utc)
    fourteen_days_ago = today - timedelta(days=14)

    fourteen_day_exprs = []
    for expr in expressions:
        if "created" in expr and expr["created"]:
            try:
                # 解析日期并转换为UTC时区
                created_date = datetime.fromisoformat(expr["created"].replace('Z', '+00:00'))
                if created_date.tzinfo is None:
                    created_date = created_date.replace(tzinfo=utc)
                else:
                    created_date = created_date.astimezone(utc)

                # 比较时区感知的日期
                if created_date >= fourteen_days_ago:
                    fourteen_day_exprs.append(expr)
            except ValueError as e:
                print(f"日期解析错误: {e}, 日期字符串: {expr['created']}")

    fourteen_day_prod = 0
    if fourteen_day_exprs:
        fourteen_day_prod = sum(expr.get("prod_corr", 0) for expr in fourteen_day_exprs) / len(fourteen_day_exprs)

    return {
        "total_prod": total_prod,
        "monthly_prod": monthly_prod,
        "fourteen_day_prod": fourteen_day_prod
    }


# 新增路由：获取Prod-correlation统计
@app.route('/prod_stats', methods=['POST'])
def prod_stats():
    data = request.json
    expressions = data.get('expressions', [])

    stats = calculate_prod_correlation_stats(expressions)

    return jsonify({
        'success': True,
        'stats': stats
    })


if __name__ == '__main__':
    app.run(debug=True)
