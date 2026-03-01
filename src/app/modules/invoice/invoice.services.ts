import httpStatus from "http-status";
import CustomizedError from "../../error/customized-error";
import { AuthUser } from "../../interface/common";
import { ConfirmPaymentPayload, GenerateInvoicePayload } from "./invoice.interfaces";

const throwInvoiceStubError = () => {
    throw new CustomizedError(
        httpStatus.NOT_IMPLEMENTED,
        "Invoicing is disabled in this pre-alpha branch. Endpoints are reserved as stubs."
    );
};

const getInvoiceById = async (_invoiceId: string, _user: AuthUser, _platformId: string) => {
    throwInvoiceStubError();
};

const downloadInvoice = async (_invoiceId: string, _user: AuthUser, _platformId: string) => {
    throwInvoiceStubError();
};

const getInvoices = async (_query: Record<string, any>, _user: AuthUser, _platformId: string) => {
    throwInvoiceStubError();
};

const confirmPayment = async (
    _orderId: string,
    _payload: ConfirmPaymentPayload,
    _user: AuthUser,
    _platformId: string
) => {
    throwInvoiceStubError();
};

const generateInvoice = async (
    _platformId: string,
    _user: AuthUser,
    _payload: GenerateInvoicePayload
) => {
    throwInvoiceStubError();
};

export const InvoiceServices = {
    getInvoiceById,
    downloadInvoice,
    getInvoices,
    confirmPayment,
    generateInvoice,
};
