import numpy as np
from sklearn.linear_model import Lasso
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler
from sklearn.metrics import mean_squared_error, r2_score
from sklearn.datasets import make_regression


def run_lasso_regression(alpha=1.0):
    # Generate sample data
    X, y = make_regression(n_samples=200, n_features=20, noise=10, random_state=42)

    # Split into train and test sets
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    # Scale features (important for Lasso)
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    # Train Lasso model
    model = Lasso(alpha=alpha, max_iter=10000)
    model.fit(X_train_scaled, y_train)

    # Predict
    y_pred = model.predict(X_test_scaled)

    # Evaluate
    mse = mean_squared_error(y_test, y_pred)
    rmse = np.sqrt(mse)
    r2 = r2_score(y_test, y_pred)

    print(f"Alpha (regularization): {alpha}")
    print(f"RMSE:                   {rmse:.4f}")
    print(f"R² Score:               {r2:.4f}")
    print(f"\nNon-zero coefficients:  {np.sum(model.coef_ != 0)} / {len(model.coef_)}")
    print(f"Intercept:              {model.intercept_:.4f}")

    return model, scaler


def find_best_alpha(alphas=None):
    """Compare multiple alpha values to find the best one."""
    if alphas is None:
        alphas = [0.01, 0.1, 1.0, 10.0, 100.0]

    X, y = make_regression(n_samples=200, n_features=20, noise=10, random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)

    print(f"{'Alpha':<10} {'RMSE':<12} {'R²':<10} {'Non-zero coefs'}")
    print("-" * 48)

    best_alpha, best_r2 = None, -np.inf
    for alpha in alphas:
        model = Lasso(alpha=alpha, max_iter=10000)
        model.fit(X_train_scaled, y_train)
        y_pred = model.predict(X_test_scaled)

        rmse = np.sqrt(mean_squared_error(y_test, y_pred))
        r2 = r2_score(y_test, y_pred)
        nonzero = np.sum(model.coef_ != 0)

        print(f"{alpha:<10} {rmse:<12.4f} {r2:<10.4f} {nonzero}")

        if r2 > best_r2:
            best_r2, best_alpha = r2, alpha

    print(f"\nBest alpha: {best_alpha} (R² = {best_r2:.4f})")
    return best_alpha


if __name__ == "__main__":
    print("=== Lasso Regression ===\n")
    run_lasso_regression(alpha=1.0)

    print("\n=== Alpha Comparison ===\n")
    find_best_alpha()
