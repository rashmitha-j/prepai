#include <bits/stdc++.h>
using namespace std;
int main(){int n;cin>>n;vector<long long>h(n);for(auto&x:h)cin>>x;int l=0,r=n-1;long long lm=0,rm=0,w=0;while(l<r){if(h[l]<h[r]){lm=max(lm,h[l]);w+=lm-h[l];l++;}else{rm=max(rm,h[r]);w+=rm-h[r];r--;}}cout<<w<<"\n";}
