import dayjs from "dayjs"
import numeral from "numeral"

export function formatDate(date: string | Date, template = "DD/MM/YYYY") {
    return dayjs(date).format(template)
}

export function formatNumber(value: number, template = "0,0") {
    return numeral(value).format(template)
}

export function formatCurrency(value: number, currency = "VND") {
    return new Intl.NumberFormat("vi-VN", { style: "currency", currency }).format(value)
}
